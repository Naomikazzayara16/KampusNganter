"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { recordPayout } from "@/server/actions/admin";
import type { ActionState } from "@/server/result";

export function PayoutForm({ driverId, balance }: { driverId: string; balance: number }) {
  const [state, action] = useActionState<ActionState, FormData>(recordPayout, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="driverId" value={driverId} />
      <input name="amount" type="number" inputMode="numeric" defaultValue={balance} max={balance} min={1} className="input w-32 py-2" />
      <input name="note" placeholder="Ref. transfer" maxLength={200} className="input w-36 py-2" />
      <SubmitButton className="btn-secondary px-3 py-2 text-sm">Catat payout</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
