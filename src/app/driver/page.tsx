import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/domain/money";
import type { OrderStatus } from "@/domain/order-status";
import { SERVICE_LABELS, type ServiceType } from "@/domain/pricing";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { claimOrder } from "@/server/actions/driver";
import { requireUser } from "@/server/auth";
import { AvailabilityForm } from "./AvailabilityForm";

export const metadata: Metadata = { title: "Driver" };

type OpenOrder = {
  id: string;
  code: string;
  service: ServiceType;
  distance_m: number;
  delivery_fee: number;
  item_budget: number;
  created_at: string;
};

export default async function DriverPage() {
  const user = await requireUser("/driver");
  if (!user.roles.has("driver")) redirect("/driver/daftar");

  // Membuka halaman ini menandakan driver masih aktif (auto-OFF setelah 30 menit tidak dibuka).
  await createServiceClient()
    .from("driver_availability")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("driver_id", user.id);

  const supabase = await createSessionClient();
  const [{ data: availability }, { data: zones }, { data: mine }, { data: ledger }] = await Promise.all([
    supabase.from("driver_availability").select("zone_id, online_until").eq("driver_id", user.id).maybeSingle(),
    supabase.from("zones").select("id, name").order("id"),
    supabase
      .from("orders")
      .select("id, code, status, service, pickup_label, dropoff_label")
      .eq("driver_id", user.id)
      .not("status", "in", "(completed,cancelled,expired)")
      .order("claimed_at"),
    supabase.from("driver_ledger").select("amount").eq("driver_id", user.id),
  ]);

  const online = Boolean(availability && new Date(availability.online_until as string) > new Date());
  const { data: open } = online ? await supabase.rpc("open_orders_for_driver") : { data: [] };
  const balance = (ledger ?? []).reduce((s, r) => s + (r.amount as number), 0);

  return (
    <div className="space-y-5">
      {online && <AutoRefresh seconds={20} />}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Driver</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${online ? "bg-emerald-100 text-emerald-900" : "bg-stone-200"}`}>
          {online ? "ON" : "OFF"}
        </span>
      </div>

      <section className="card space-y-2">
        {online && availability && (
          <p className="text-sm text-stone-600">
            ON sampai{" "}
            {new Date(availability.online_until as string).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB. Otomatis OFF bila halaman ini tidak dibuka 30 menit.
          </p>
        )}
        <AvailabilityForm
          online={online}
          zones={(zones ?? []) as { id: number; name: string }[]}
          currentZone={(availability?.zone_id as number | undefined) ?? null}
        />
      </section>

      <section className="card flex items-center justify-between">
        <span className="text-sm text-stone-600">Saldo (dicairkan harian)</span>
        <span className="text-lg font-bold">{formatRupiah(Math.max(0, balance))}</span>
      </section>

      {(mine ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Order yang kamu pegang</h2>
          {(mine ?? []).map((o) => (
            <Link key={o.id as string} href={`/driver/order/${o.id as string}`} className="card block space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{o.code as string}</span>
                <StatusBadge status={o.status as OrderStatus} />
              </div>
              <p className="text-sm text-stone-600">
                {o.pickup_label as string} → {o.dropoff_label as string}
              </p>
            </Link>
          ))}
        </section>
      )}

      {online && (
        <section className="space-y-2">
          <h2 className="font-semibold">Order tersedia</h2>
          {(open ?? []).length === 0 && <p className="text-sm text-stone-600">Belum ada order di zonamu.</p>}
          {((open ?? []) as OpenOrder[]).map((o) => (
            <div key={o.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{SERVICE_LABELS[o.service]}</span>
                <span className="text-lg font-bold">{formatRupiah(o.delivery_fee)}</span>
              </div>
              <p className="text-sm text-stone-600">
                ±{(o.distance_m / 1000).toFixed(1)} km
                {o.item_budget > 0 && ` · talangan belanja maks. ${formatRupiah(o.item_budget)}`}
              </p>
              <ActionButton action={claimOrder.bind(null, o.id)}>Ambil</ActionButton>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
