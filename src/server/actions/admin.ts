"use server";

import { revalidatePath } from "next/cache";
import { canTransition, type OrderStatus } from "@/domain/order-status";
import type { ServiceType } from "@/domain/pricing";
import { settleCancellation } from "@/domain/settlement";
import { createServiceClient } from "@/lib/supabase/server";
import {
  adminCancelForm,
  confirmPaymentForm,
  firstError,
  formToObject,
  payoutForm,
  reviewDriverForm,
} from "@/lib/validation";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth";
import { dbErrorMessage, fail, ok, type ActionState } from "@/server/result";
import { removeFiles } from "@/server/storage";

export async function confirmPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = confirmPaymentForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await createServiceClient().rpc("confirm_payment", {
    p_order_id: parsed.data.orderId,
    p_admin: admin.id,
    p_amount: parsed.data.amount,
    p_reference: parsed.data.reference ?? null,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/admin");
  return ok("Pembayaran dikonfirmasi. Order ditawarkan ke driver.");
}

export async function adminCancelOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = adminCancelForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));

  const db = createServiceClient();
  const { data } = await db
    .from("orders")
    .select("id, status, service, delivery_fee, buyer_service_fee, item_budget, driver_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!data) return fail("Order tidak ditemukan.");
  const order = data as {
    id: string;
    status: OrderStatus;
    service: ServiceType;
    delivery_fee: number;
    buyer_service_fee: number;
    item_budget: number;
    driver_id: string | null;
  };
  if (!canTransition(order.status, "cancelled", "admin", order.service)) {
    return fail("Order ini tidak bisa dibatalkan.");
  }
  const reason = order.driver_id ? parsed.data.reason : "before_driver";
  const money =
    order.status === "awaiting_payment"
      ? { driverEarning: 0, buyerRefund: 0, platformFee: 0 }
      : settleCancellation({
          reason,
          deliveryFee: order.delivery_fee,
          buyerServiceFee: order.buyer_service_fee,
          itemBudget: order.item_budget,
        });

  const { error } = await db.rpc("cancel_order", {
    p_order_id: order.id,
    p_actor: admin.id,
    p_role: "admin",
    p_reason: reason,
    p_driver_earning: money.driverEarning,
    p_buyer_refund: money.buyerRefund,
    p_platform_fee: money.platformFee,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/pesanan/${order.id}`);
  return ok(
    `Order dibatalkan. Refund ke buyer Rp${money.buyerRefund.toLocaleString("id-ID")}, ` +
      `ke driver Rp${money.driverEarning.toLocaleString("id-ID")}.`,
  );
}

export async function reviewDriver(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = reviewDriverForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { userId, decision } = parsed.data;
  const db = createServiceClient();

  if (decision === "approve") {
    if (!parsed.data.nickname) return fail("Isi nama panggilan driver.");
    const { error } = await db.rpc("approve_driver", {
      p_user: userId,
      p_admin: admin.id,
      p_nickname: parsed.data.nickname,
    });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin");
    return ok("Driver disetujui.");
  }

  const { data: app } = await db
    .from("driver_applications")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (app?.status !== "pending") return fail("Pendaftaran ini sudah diproses.");

  // UU PDP: dokumen calon yang ditolak dihapus, bukan disimpan.
  const { data: docs } = await db.from("driver_documents").select("storage_path").eq("user_id", userId);
  await removeFiles(
    "driver-documents",
    (docs ?? []).map((d) => d.storage_path as string),
  );
  await db.from("driver_documents").delete().eq("user_id", userId);
  const { error } = await db
    .from("driver_applications")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.note ?? null,
    })
    .eq("user_id", userId);
  if (error) return fail(dbErrorMessage(error));
  await audit(admin.id, "driver.reject", { type: "user", id: userId }, { documentsDeleted: docs?.length ?? 0 });
  revalidatePath("/admin");
  return ok("Pendaftaran ditolak dan dokumennya dihapus.");
}

export async function recordPayout(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = payoutForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const db = createServiceClient();

  const { data: rows } = await db.from("driver_ledger").select("amount").eq("driver_id", parsed.data.driverId);
  const balance = (rows ?? []).reduce((sum, r) => sum + (r.amount as number), 0);
  if (parsed.data.amount > balance) return fail("Nominal payout melebihi saldo driver.");

  const { error } = await db.from("driver_ledger").insert({
    driver_id: parsed.data.driverId,
    kind: "payout",
    amount: -parsed.data.amount,
    note: parsed.data.note ?? null,
    created_by: admin.id,
  });
  if (error) return fail(dbErrorMessage(error));
  await audit(admin.id, "driver.payout", { type: "user", id: parsed.data.driverId }, {
    amount: parsed.data.amount,
  });
  revalidatePath("/admin");
  return ok("Payout tercatat.");
}
