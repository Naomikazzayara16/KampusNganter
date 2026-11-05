"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { OrderStatus } from "@/domain/order-status";
import { advanceOrder } from "@/server/actions/driver";
import type { ActionState } from "@/server/result";

const STEP_LABELS: Partial<Record<OrderStatus, string>> = {
  at_pickup: "Sampai di toko / titik ambil",
  purchased: "Sudah dibeli",
  on_the_way: "Jalan ke buyer",
  arrived: "Sampai & serahkan",
};

export function StepForm({
  orderId,
  from,
  to,
  itemBudget,
}: {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  itemBudget: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(advanceOrder, null);
  const needsPhoto = to === "purchased" || to === "arrived";
  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      {to === "purchased" && (
        <div>
          <label htmlFor="itemTotal" className="label">
            Total belanja (maks. Rp{itemBudget.toLocaleString("id-ID")})
          </label>
          <input id="itemTotal" name="itemTotal" type="number" inputMode="numeric" min={0} max={itemBudget} required className="input" />
        </div>
      )}
      {needsPhoto && (
        <div>
          <label htmlFor="photo" className="label">
            {to === "purchased" ? "Foto struk / daftar harga / bukti bayar QRIS" : "Foto serah terima"}
          </label>
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="text-sm" />
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton>{STEP_LABELS[to] ?? "Lanjut"}</SubmitButton>
    </form>
  );
}
