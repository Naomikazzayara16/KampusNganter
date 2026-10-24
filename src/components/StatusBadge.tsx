import { STATUS_LABELS, type OrderStatus } from "@/domain/order-status";

const TONE: Partial<Record<OrderStatus, string>> = {
  awaiting_payment: "bg-amber-100 text-amber-900",
  searching_driver: "bg-sky-100 text-sky-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-stone-200 text-stone-700",
  expired: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[status] ?? "bg-teal-100 text-teal-900"}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
