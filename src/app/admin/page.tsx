import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/domain/money";
import type { OrderStatus } from "@/domain/order-status";
import { createSessionClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth";
import { expireStaleOrders } from "@/server/queries/orders";
import { ConfirmPaymentForm } from "./AdminOrderControls";
import { PayoutForm } from "./PayoutForm";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireRole("admin");
  await expireStaleOrders();
  const supabase = await createSessionClient();

  const [{ data: unpaid }, { data: active }, { data: applications }, { data: drivers }, { data: ledger }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, code, amount_due, created_at")
        .eq("status", "awaiting_payment")
        .order("created_at"),
      supabase
        .from("orders")
        .select("id, code, status, pickup_label, dropoff_label")
        .in("status", ["searching_driver", "driver_assigned", "at_pickup", "purchased", "on_the_way", "arrived"])
        .order("created_at"),
      supabase
        .from("driver_applications")
        .select("user_id, full_name, campus, created_at")
        .eq("status", "pending")
        .order("created_at"),
      supabase.from("drivers").select("user_id, nickname"),
      supabase.from("driver_ledger").select("driver_id, amount"),
    ]);

  const balances = new Map<string, number>();
  for (const r of ledger ?? []) {
    balances.set(r.driver_id as string, (balances.get(r.driver_id as string) ?? 0) + (r.amount as number));
  }

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <h1 className="text-xl font-bold">Admin</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Menunggu pembayaran ({unpaid?.length ?? 0})</h2>
        <p className="text-xs text-stone-500">Cocokkan nominal persis (termasuk kode unik) dengan mutasi QRIS.</p>
        {(unpaid ?? []).map((o) => (
          <div key={o.id as string} className="card space-y-2">
            <div className="flex justify-between">
              <Link href={`/pesanan/${o.id as string}`} className="font-mono text-sm underline">
                {o.code as string}
              </Link>
              <span className="font-bold">{formatRupiah(o.amount_due as number)}</span>
            </div>
            <ConfirmPaymentForm orderId={o.id as string} amountDue={formatRupiah(o.amount_due as number)} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Order berjalan ({active?.length ?? 0})</h2>
        {(active ?? []).map((o) => (
          <Link key={o.id as string} href={`/pesanan/${o.id as string}`} className="card flex items-center justify-between">
            <span className="font-mono text-sm">{o.code as string}</span>
            <StatusBadge status={o.status as OrderStatus} />
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Pendaftar driver ({applications?.length ?? 0})</h2>
        {(applications ?? []).map((a) => (
          <Link key={a.user_id as string} href={`/admin/driver/${a.user_id as string}`} className="card block">
            {a.full_name as string} · {a.campus as string}
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Saldo driver (payout harian)</h2>
        {(drivers ?? [])
          .map((d) => ({ id: d.user_id as string, name: d.nickname as string, balance: balances.get(d.user_id as string) ?? 0 }))
          .filter((d) => d.balance > 0)
          .map((d) => (
            <div key={d.id} className="card space-y-2">
              <div className="flex justify-between">
                <span>{d.name}</span>
                <span className="font-bold">{formatRupiah(d.balance)}</span>
              </div>
              <PayoutForm driverId={d.id} balance={d.balance} />
            </div>
          ))}
      </section>
    </div>
  );
}
