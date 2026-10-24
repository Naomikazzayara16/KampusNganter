import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProofGallery } from "@/components/ProofGallery";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/domain/money";
import { canTransition, TERMINAL_STATUSES } from "@/domain/order-status";
import { SERVICE_LABELS } from "@/domain/pricing";
import { env } from "@/lib/env";
import { cancelOwnOrder, confirmReceived } from "@/server/actions/orders";
import { requireUser } from "@/server/auth";
import { getAssignedDriver, getOrderProofs, getVisibleOrder } from "@/server/queries/orders";
import { AdminCancelForm, ConfirmPaymentForm } from "../../admin/AdminOrderControls";

export const metadata: Metadata = { title: "Detail pesanan" };

export default async function OrderDetailPage(props: PageProps<"/pesanan/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/pesanan/${id}`);
  const order = await getVisibleOrder(id);
  if (!order) notFound();

  const isBuyer = order.buyer_id === user.id;
  const isAdmin = user.roles.has("admin");
  if (!isBuyer && !isAdmin) notFound();

  const [driver, proofs] = await Promise.all([getAssignedDriver(order.driver_id), getOrderProofs(order.id)]);
  const qris = env().QRIS_IMAGE_URL;
  const live = !TERMINAL_STATUSES.has(order.status);

  return (
    <div className="space-y-4">
      {live && <AutoRefresh seconds={15} />}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold">{order.code}</h1>
        <StatusBadge status={order.status} />
      </div>

      {order.status === "awaiting_payment" && (
        <section className="card space-y-3 text-center">
          <h2 className="font-semibold">Bayar ke QRIS KampusNganter</h2>
          {qris ? (
            // eslint-disable-next-line @next/next/no-img-element -- gambar QRIS statis dari admin
            <img src={qris} alt="QRIS KampusNganter" className="mx-auto w-64 rounded-xl border" />
          ) : (
            <p className="text-sm text-amber-800">Gambar QRIS belum diatur admin.</p>
          )}
          <p className="text-sm text-stone-600">Bayar tepat sebesar</p>
          <p className="text-3xl font-bold tracking-tight">{formatRupiah(order.amount_due)}</p>
          <p className="text-xs text-stone-500">
            Tiga digit terakhir ({String(order.unique_code).padStart(3, "0")}) adalah kode unik order ini.
            Bayar sebelum{" "}
            {new Date(order.payment_deadline).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB. Admin akan mengonfirmasi, lalu order dikirim ke driver.
          </p>
        </section>
      )}

      {order.status === "searching_driver" && (
        <p className="card text-sm">Pembayaran diterima. Sedang mencari driver di zona ini…</p>
      )}

      {driver && live && (
        <section className="card space-y-1">
          <h2 className="font-semibold">Driver kamu</h2>
          <p>
            {driver.nickname} · {driver.campus}
          </p>
          <p className="text-sm text-stone-600">
            {driver.vehicle_type} · <span className="font-mono">{driver.plate_number}</span>
          </p>
        </section>
      )}

      <section className="card space-y-2 text-sm">
        <p className="font-semibold">{SERVICE_LABELS[order.service]}</p>
        <p>
          <span className="text-stone-500">Dari:</span> {order.pickup_label}
        </p>
        <p>
          <span className="text-stone-500">Ke:</span> {order.dropoff_label}
        </p>
        <p className="whitespace-pre-wrap">{order.details}</p>
        <dl className="space-y-1 border-t border-stone-200 pt-2">
          <Line label={`Ongkir (${(order.distance_m / 1000).toFixed(1)} km)`} value={order.delivery_fee} />
          <Line label="Biaya layanan" value={order.buyer_service_fee} />
          {order.item_budget > 0 && <Line label="Budget belanja" value={order.item_budget} />}
          <Line label="Kode unik" value={order.unique_code} />
          <Line label="Dibayar" value={order.amount_due} bold />
          {order.item_total !== null && order.service === "beli" && (
            <Line label="Total belanja (dari driver)" value={order.item_total} />
          )}
          {order.wait_fee > 0 && <Line label="Biaya tunggu" value={order.wait_fee} />}
          {order.buyer_refund !== null && order.buyer_refund > 0 && (
            <Line label="Dikembalikan ke kamu" value={order.buyer_refund} bold />
          )}
        </dl>
      </section>

      <ProofGallery proofs={proofs} />

      {isBuyer && order.status === "arrived" && (
        <ActionButton action={confirmReceived.bind(null, order.id)} confirmText="Barang sudah kamu terima?">
          Terima pesanan
        </ActionButton>
      )}
      {isBuyer && canTransition(order.status, "cancelled", "buyer", order.service) && (
        <ActionButton
          action={cancelOwnOrder.bind(null, order.id)}
          confirmText="Batalkan order ini?"
          className="btn-secondary w-full"
        >
          Batalkan order
        </ActionButton>
      )}

      {isAdmin && (
        <section className="card space-y-4 border-amber-300">
          <h2 className="font-semibold">Admin</h2>
          {order.status === "awaiting_payment" && (
            <ConfirmPaymentForm orderId={order.id} amountDue={formatRupiah(order.amount_due)} />
          )}
          {canTransition(order.status, "cancelled", "admin", order.service) && (
            <AdminCancelForm orderId={order.id} />
          )}
        </section>
      )}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{formatRupiah(value)}</dd>
    </div>
  );
}
