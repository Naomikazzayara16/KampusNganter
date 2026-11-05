import "server-only";
import type { OrderStatus } from "@/domain/order-status";
import type { ServiceType } from "@/domain/pricing";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { signedUrl } from "@/server/storage";

export type OrderView = {
  id: string;
  code: string;
  buyer_id: string;
  driver_id: string | null;
  zone_id: number;
  service: ServiceType;
  status: OrderStatus;
  pickup_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  details: string;
  distance_m: number;
  delivery_fee: number;
  buyer_service_fee: number;
  item_budget: number;
  total: number;
  unique_code: number;
  amount_due: number;
  payment_deadline: string;
  item_total: number | null;
  wait_fee: number;
  driver_earning: number | null;
  buyer_refund: number | null;
  platform_fee: number | null;
  cancel_reason: string | null;
  created_at: string;
  at_pickup_at: string | null;
};

const ORDER_COLUMNS =
  "id, code, buyer_id, driver_id, zone_id, service, status, pickup_label, pickup_lat, pickup_lng, " +
  "dropoff_label, dropoff_lat, dropoff_lng, details, distance_m, delivery_fee, buyer_service_fee, " +
  "item_budget, total, unique_code, amount_due, payment_deadline, item_total, wait_fee, " +
  "driver_earning, buyer_refund, platform_fee, cancel_reason, created_at, at_pickup_at";

/** Order yang boleh dilihat pengguna ini (RLS memutuskan: buyer, driver order itu, atau admin). */
export async function getVisibleOrder(id: string): Promise<OrderView | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createSessionClient();
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  return (data as OrderView | null) ?? null;
}

export async function listBuyerOrders(userId: string): Promise<OrderView[]> {
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data as OrderView[] | null) ?? [];
}

export type DriverCard = { nickname: string; campus: string; vehicle_type: string; plate_number: string };

export async function getAssignedDriver(driverId: string | null): Promise<DriverCard | null> {
  if (!driverId) return null;
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("drivers")
    .select("nickname, campus, vehicle_type, plate_number")
    .eq("user_id", driverId)
    .maybeSingle();
  return (data as DriverCard | null) ?? null;
}

export type ProofView = { id: string; kind: string; url: string | null; created_at: string };

/**
 * Foto bukti order. Baris dibaca lewat RLS (hanya peserta order), lalu
 * link sementara dibuat oleh server untuk baris yang lolos saja.
 */
export async function getOrderProofs(orderId: string): Promise<ProofView[]> {
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("order_proofs")
    .select("id, kind, storage_path, created_at")
    .eq("order_id", orderId)
    .order("created_at");
  const rows = (data ?? []) as Array<{ id: string; kind: string; storage_path: string; created_at: string }>;
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      created_at: r.created_at,
      url: await signedUrl("order-proofs", r.storage_path),
    })),
  );
}

export async function getBuyerName(buyerId: string): Promise<string> {
  const supabase = await createSessionClient();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", buyerId).maybeSingle();
  return (data?.display_name as string | undefined) ?? "Buyer";
}

export async function expireStaleOrders(): Promise<void> {
  await createServiceClient().rpc("expire_stale_orders");
}
