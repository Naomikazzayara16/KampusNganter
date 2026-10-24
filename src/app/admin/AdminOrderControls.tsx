"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { CANCEL_REASON_LABELS, CANCEL_REASONS } from "@/domain/settlement";
import { adminCancelOrder, confirmPayment } from "@/server/actions/admin";
import type { ActionState } from "@/server/result";

export function ConfirmPaymentForm({ orderId, amountDue }: { orderId: string; amountDue: string }) {
  const [state, action] = useActionState<ActionState, FormData>(confirmPayment, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="label" htmlFor={`amount-${orderId}`}>
        Nominal di mutasi QRIS (harus {amountDue})
      </label>
      <input id={`amount-${orderId}`} name="amount" type="number" inputMode="numeric" required className="input" />
      <input name="reference" placeholder="Catatan / no. referensi (opsional)" maxLength={80} className="input" />
      <FormMessage state={state} />
      <SubmitButton className="btn w-full">Konfirmasi pembayaran masuk</SubmitButton>
    </form>
  );
}

export function AdminCancelForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(adminCancelOrder, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="label" htmlFor={`reason-${orderId}`}>
        Batalkan order (admin)
      </label>
      <select id={`reason-${orderId}`} name="reason" className="input">
        {CANCEL_REASONS.map((r) => (
          <option key={r} value={r}>
            {CANCEL_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <FormMessage state={state} />
      <SubmitButton className="btn-danger w-full">Batalkan & hitung refund</SubmitButton>
    </form>
  );
}
