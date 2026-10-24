"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { estimatedRoadMeters, isValidLatLng } from "@/domain/geo";
import { canTransition, type OrderStatus } from "@/domain/order-status";
import { amountToPay, paymentDeadline, pickUniqueCode } from "@/domain/payment";
import { PricingError, quote, type ServiceType } from "@/domain/pricing";
import { settleCancellation, settleCompletedOrder } from "@/domain/settlement";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { firstError, formToObject, orderForm, uuid } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { dbErrorMessage, fail, ok, type ActionState } from "@/server/result";

const MAX_UNPAID_ORDERS = 3;

export async function createOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/pesan");
  const parsed = orderForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  const pickup = { lat: input.pickupLat, lng: input.pickupLng };
  const dropoff = { lat: input.dropoffLat, lng: input.dropoffLng };
  if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) return fail("Pilih titik di peta.");

  // Ongkir selalu dihitung ulang di server; angka dari browser tidak dipakai.
  let q;
  try {
    q = quote({
      service: input.service,
      distanceMeters: estimatedRoadMeters(pickup, dropoff),
      extraStores: input.service === "beli" ? input.extraStores : 0,
      itemBudget: input.service === "beli" ? input.itemBudget : 0,
    });
  } catch (e) {
    if (e instanceof PricingError) return fail(e.message);
    throw e;
  }

  const db = createServiceClient();
  await db.rpc("expire_stale_orders");

  const { data: zone } = await db.from("zones").select("id").eq("id", input.zoneId).eq("active", true).maybeSingle();
  if (!zone) return fail("Zona tidak tersedia.");

  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", user.id)
    .eq("status", "awaiting_payment");
  if ((count ?? 0) >= MAX_UNPAID_ORDERS) {
    return fail("Selesaikan atau batalkan order yang belum dibayar dulu.");
  }

  // Kode unik bisa bentrok bila dua order dibuat bersamaan; unique index menolak, lalu coba lagi.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: taken } = await db.from("orders").select("unique_code").eq("status", "awaiting_payment");
    const code = pickUniqueCode(new Set((taken ?? []).map((r) => r.unique_code as number)));
    const { data, error } = await db
      .from("orders")
      .insert({
        buyer_id: user.id,
        zone_id: input.zoneId,
        service: q.service,
        pickup_label: input.pickupLabel,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_label: input.dropoffLabel,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        details: input.details,
        distance_m: q.distanceMeters,
        extra_stores: input.service === "beli" ? input.extraStores : 0,
        base_fee: q.baseFee,
        distance_fee: q.distanceFee,
        extra_store_fee: q.extraStoreFee,
        delivery_fee: q.deliveryFee,
        buyer_service_fee: q.buyerServiceFee,
        item_budget: q.itemBudget,
        total: q.total,
        unique_code: code,
        amount_due: amountToPay(q.total, code),
        payment_deadline: paymentDeadline(new Date()).toISOString(),
      })
      .select("id")
      .single();
    if (!error) redirect(`/pesanan/${data.id as string}`);
    if (error.code !== "23505") return fail(dbErrorMessage(error));
  }
  return fail("Sedang ramai. Coba lagi sebentar lagi.");
}

type BuyerOrder = {
  id: string;
  buyer_id: string;
  status: OrderStatus;
  service: ServiceType;
  delivery_fee: number;
  buyer_service_fee: number;
  item_budget: number;
  item_total: number | null;
  wait_fee: number;
};

async function loadOwnOrder(orderId: string, userId: string): Promise<BuyerOrder | null> {
  if (!uuid.safeParse(orderId).success) return null;
  // Dibaca dengan sesi pengguna: RLS ikut memastikan order ini miliknya.
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("orders")
    .select("id, buyer_id, status, service, delivery_fee, buyer_service_fee, item_budget, item_total, wait_fee")
    .eq("id", orderId)
    .maybeSingle();
  if (!data || data.buyer_id !== userId) return null;
  return data as BuyerOrder;
}

export async function cancelOwnOrder(orderId: string): Promise<ActionState> {
  const user = await requireUser();
  const order = await loadOwnOrder(orderId, user.id);
  if (!order) return fail("Order tidak ditemukan.");
  if (!canTransition(order.status, "cancelled", "buyer", order.service)) {
    return fail("Order yang sudah diambil driver hanya bisa dibatalkan lewat admin.");
  }
  const money =
    order.status === "awaiting_payment"
      ? { driverEarning: 0, buyerRefund: 0, platformFee: 0 }
      : settleCancellation({
          reason: "before_driver",
          deliveryFee: order.delivery_fee,
          buyerServiceFee: order.buyer_service_fee,
          itemBudget: order.item_budget,
        });
  const { error } = await createServiceClient().rpc("cancel_order", {
    p_order_id: order.id,
    p_actor: user.id,
    p_role: "buyer",
    p_reason: "before_driver",
    p_driver_earning: money.driverEarning,
    p_buyer_refund: money.buyerRefund,
    p_platform_fee: money.platformFee,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/pesanan/${order.id}`);
  return ok(
    money.buyerRefund > 0
      ? "Order dibatalkan. Dana dikembalikan penuh oleh admin."
      : "Order dibatalkan.",
  );
}

export async function confirmReceived(orderId: string): Promise<ActionState> {
  const user = await requireUser();
  const order = await loadOwnOrder(orderId, user.id);
  if (!order) return fail("Order tidak ditemukan.");
  if (!canTransition(order.status, "completed", "buyer", order.service)) {
    return fail("Order belum sampai.");
  }
  const s = settleCompletedOrder({
    deliveryFee: order.delivery_fee,
    buyerServiceFee: order.buyer_service_fee,
    itemBudget: order.item_budget,
    itemTotal: order.item_total ?? 0,
    waitFee: order.wait_fee,
  });
  const { error } = await createServiceClient().rpc("complete_order", {
    p_order_id: order.id,
    p_actor: user.id,
    p_role: "buyer",
    p_driver_earning: s.driverEarning,
    p_buyer_refund: s.buyerRefund,
    p_platform_fee: s.platformFee,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/pesanan/${order.id}`);
  return ok("Terima kasih! Order selesai.");
}
