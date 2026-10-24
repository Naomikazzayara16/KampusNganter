"use server";

import { revalidatePath } from "next/cache";
import { canTransition, type OrderStatus } from "@/domain/order-status";
import { waitFee, type ServiceType } from "@/domain/pricing";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import {
  advanceForm,
  availabilityForm,
  documentKind,
  driverApplicationForm,
  firstError,
  formToObject,
  uuid,
} from "@/lib/validation";
import { requireRole, requireUser } from "@/server/auth";
import { dbErrorMessage, fail, ok, type ActionState } from "@/server/result";
import { removeFiles, storePrivateFile } from "@/server/storage";

export async function submitApplication(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/driver/daftar");
  const parsed = driverApplicationForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const a = parsed.data;

  const db = createServiceClient();
  const { data: existing } = await db
    .from("driver_applications")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.status === "approved") return fail("Kamu sudah terdaftar sebagai driver.");

  const { error } = await db.from("driver_applications").upsert({
    user_id: user.id,
    full_name: a.fullName,
    nim: a.nim,
    campus: a.campus,
    vehicle_type: a.vehicleType,
    plate_number: a.plateNumber,
    bank_name: a.bankName,
    bank_account_number: a.bankAccountNumber,
    bank_account_name: a.bankAccountName,
    consent_at: new Date().toISOString(),
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/driver/daftar");
  return ok("Data tersimpan. Lanjut unggah dokumen di bawah.");
}

export async function uploadDocument(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/driver/daftar");
  const kind = documentKind.safeParse(form.get("kind"));
  if (!kind.success) return fail("Jenis dokumen tidak valid.");

  const db = createServiceClient();
  const { data: app } = await db
    .from("driver_applications")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!app) return fail("Isi data pendaftaran dulu.");
  if (app.status !== "pending") return fail("Pendaftaran sudah diproses; dokumen tidak bisa diganti.");

  const stored = await storePrivateFile("driver-documents", user.id, kind.data, form.get("file"));
  if (!stored.ok) return fail(stored.error);

  const { data: old } = await db
    .from("driver_documents")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("kind", kind.data)
    .maybeSingle();

  const { error } = await db.from("driver_documents").upsert(
    {
      user_id: user.id,
      kind: kind.data,
      storage_path: stored.file.path,
      mime: stored.file.mime,
      size_bytes: stored.file.size,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind" },
  );
  if (error) {
    await removeFiles("driver-documents", [stored.file.path]);
    return fail(dbErrorMessage(error));
  }
  if (old?.storage_path) await removeFiles("driver-documents", [old.storage_path as string]);
  revalidatePath("/driver/daftar");
  return ok("Dokumen terunggah.");
}

export async function setAvailability(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("driver");
  const parsed = availabilityForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const db = createServiceClient();

  if (parsed.data.online === "off") {
    await db.from("driver_availability").delete().eq("driver_id", user.id);
    revalidatePath("/driver");
    return ok("Status OFF.");
  }
  const now = Date.now();
  const { error } = await db.from("driver_availability").upsert({
    driver_id: user.id,
    zone_id: parsed.data.zoneId,
    online_until: new Date(now + parsed.data.hours * 3_600_000).toISOString(),
    last_seen_at: new Date(now).toISOString(),
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/driver");
  return ok(`Status ON selama ${parsed.data.hours} jam.`);
}

export async function claimOrder(orderId: string): Promise<ActionState> {
  const user = await requireRole("driver");
  if (!uuid.safeParse(orderId).success) return fail("Order tidak valid.");
  const { error } = await createServiceClient().rpc("claim_order", {
    p_order_id: orderId,
    p_driver: user.id,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/driver");
  return ok("Order berhasil diambil.");
}

type DriverOrder = {
  id: string;
  driver_id: string | null;
  status: OrderStatus;
  service: ServiceType;
  item_budget: number;
  at_pickup_at: string | null;
};

export async function advanceOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireRole("driver");
  const parsed = advanceForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { orderId, from, to } = parsed.data;

  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("orders")
    .select("id, driver_id, status, service, item_budget, at_pickup_at")
    .eq("id", orderId)
    .maybeSingle();
  const order = data as DriverOrder | null;
  if (!order || order.driver_id !== user.id) return fail("Order tidak ditemukan.");
  if (order.status !== from) return fail("Status order sudah berubah. Muat ulang halaman.");
  if (!canTransition(from, to, "driver", order.service)) return fail("Langkah ini tidak tersedia.");

  const db = createServiceClient();
  let itemTotal: number | null = null;
  let wait: number | null = null;

  if (to === "purchased" || to === "arrived") {
    const kind = to === "purchased" ? "receipt" : "handover";
    if (to === "purchased") {
      if (parsed.data.itemTotal === undefined) return fail("Isi total belanja.");
      itemTotal = parsed.data.itemTotal;
      if (itemTotal > order.item_budget) {
        return fail("Total belanja melebihi budget buyer. Minta buyer menambah dana lewat admin.");
      }
      const waitedMinutes = order.at_pickup_at
        ? (Date.now() - new Date(order.at_pickup_at).getTime()) / 60_000
        : 0;
      // Biaya tunggu dibayar dari sisa budget, jadi tidak bisa melebihi sisa itu.
      wait = Math.min(waitFee(order.service, waitedMinutes), order.item_budget - itemTotal);
    }
    const stored = await storePrivateFile("order-proofs", order.id, kind, form.get("photo"), {
      imagesOnly: true,
    });
    if (!stored.ok) return fail(stored.error);
    const { error } = await db.from("order_proofs").insert({
      order_id: order.id,
      kind,
      storage_path: stored.file.path,
      uploaded_by: user.id,
    });
    if (error) {
      await removeFiles("order-proofs", [stored.file.path]);
      return fail(dbErrorMessage(error));
    }
  }

  const { error } = await db.rpc("advance_order", {
    p_order_id: order.id,
    p_actor: user.id,
    p_role: "driver",
    p_from: from,
    p_to: to,
    p_item_total: itemTotal,
    p_wait_fee: wait,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/driver/order/${order.id}`);
  return ok("Status diperbarui.");
}

export async function releaseOrder(orderId: string): Promise<ActionState> {
  const user = await requireRole("driver");
  if (!uuid.safeParse(orderId).success) return fail("Order tidak valid.");
  const { error } = await createServiceClient().rpc("advance_order", {
    p_order_id: orderId,
    p_actor: user.id,
    p_role: "driver",
    p_from: "driver_assigned",
    p_to: "searching_driver",
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/driver");
  return ok("Order dilepas dan ditawarkan ke driver lain.");
}
