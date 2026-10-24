import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { ProofGallery } from "@/components/ProofGallery";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/domain/money";
import { nextDriverStep } from "@/domain/order-status";
import { SERVICE_LABELS } from "@/domain/pricing";
import { redactContactInfo } from "@/domain/redact";
import { releaseOrder } from "@/server/actions/driver";
import { requireRole } from "@/server/auth";
import { getBuyerName, getOrderProofs, getVisibleOrder } from "@/server/queries/orders";
import { StepForm } from "./StepForm";

export const metadata: Metadata = { title: "Order driver" };

function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export default async function DriverOrderPage(props: PageProps<"/driver/order/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("driver");
  const order = await getVisibleOrder(id);
  if (!order || order.driver_id !== user.id) notFound();

  const [buyerName, proofs] = await Promise.all([getBuyerName(order.buyer_id), getOrderProofs(order.id)]);
  const next = nextDriverStep(order.status, order.service);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold">{order.code}</h1>
        <StatusBadge status={order.status} />
      </div>

      <section className="card space-y-2 text-sm">
        <p className="font-semibold">
          {SERVICE_LABELS[order.service]} · untuk {buyerName}
        </p>
        <p>
          <span className="text-stone-500">Ambil:</span> {order.pickup_label}{" "}
          <a href={mapsLink(order.pickup_lat, order.pickup_lng)} target="_blank" rel="noopener noreferrer" className="text-brand underline">
            peta
          </a>
        </p>
        <p>
          <span className="text-stone-500">Antar:</span> {order.dropoff_label}{" "}
          <a href={mapsLink(order.dropoff_lat, order.dropoff_lng)} target="_blank" rel="noopener noreferrer" className="text-brand underline">
            peta
          </a>
        </p>
        <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-2">{redactContactInfo(order.details)}</p>
        <p>
          Ongkir {formatRupiah(order.delivery_fee)}
          {order.item_budget > 0 && ` · budget belanja maks. ${formatRupiah(order.item_budget)}`}
        </p>
      </section>

      <ProofGallery proofs={proofs} />

      {next && <StepForm orderId={order.id} from={order.status} to={next} itemBudget={order.item_budget} />}
      {order.status === "arrived" && (
        <p className="card text-sm">Menunggu buyer menekan &ldquo;Terima&rdquo;. Saldo masuk setelah itu.</p>
      )}
      {order.status === "driver_assigned" && (
        <ActionButton
          action={releaseOrder.bind(null, order.id)}
          confirmText="Lepas order ini? Order akan ditawarkan ke driver lain."
          className="btn-secondary w-full"
        >
          Lepas order
        </ActionButton>
      )}
      <p className="text-xs text-stone-500">
        Ada masalah (toko tutup, alamat tidak ketemu)? Hubungi admin; jangan minta nomor buyer.
      </p>
    </div>
  );
}
