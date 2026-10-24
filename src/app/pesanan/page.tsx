import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/domain/money";
import { SERVICE_LABELS } from "@/domain/pricing";
import { requireUser } from "@/server/auth";
import { expireStaleOrders, listBuyerOrders } from "@/server/queries/orders";

export const metadata: Metadata = { title: "Pesanan" };

export default async function OrdersPage() {
  const user = await requireUser("/pesanan");
  await expireStaleOrders();
  const orders = await listBuyerOrders(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pesanan saya</h1>
        <Link href="/pesan" className="btn px-3 py-2 text-sm">
          + Pesan
        </Link>
      </div>
      {orders.length === 0 && <p className="text-stone-600">Belum ada pesanan.</p>}
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/pesanan/${o.id}`} className="card block space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{o.code}</span>
                <StatusBadge status={o.status} />
              </div>
              <p className="text-sm">{SERVICE_LABELS[o.service]}</p>
              <p className="text-sm text-stone-600">
                {o.pickup_label} → {o.dropoff_label}
              </p>
              <p className="text-sm font-semibold">{formatRupiah(o.amount_due)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
