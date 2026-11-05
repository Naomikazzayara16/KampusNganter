"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { reviewDriver } from "@/server/actions/admin";
import type { ActionState } from "@/server/result";

export function ReviewForm({ userId, suggestedNickname }: { userId: string; suggestedNickname: string }) {
  const [approveState, approve] = useActionState<ActionState, FormData>(reviewDriver, null);
  const [rejectState, reject] = useActionState<ActionState, FormData>(reviewDriver, null);
  return (
    <div className="space-y-4">
      <form action={approve} className="card space-y-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="decision" value="approve" />
        <label htmlFor="nickname" className="label">
          Nama panggilan (dilihat buyer)
        </label>
        <input id="nickname" name="nickname" defaultValue={suggestedNickname} required maxLength={30} className="input" />
        <p className="text-xs text-stone-500">Setujui hanya setelah NIM dicek di PDDikti dan wawancara selesai.</p>
        <FormMessage state={approveState} />
        <SubmitButton>Setujui driver</SubmitButton>
      </form>
      <form action={reject} className="card space-y-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="decision" value="reject" />
        <label htmlFor="note" className="label">
          Alasan penolakan (dilihat pendaftar)
        </label>
        <input id="note" name="note" maxLength={300} className="input" />
        <FormMessage state={rejectState} />
        <SubmitButton className="btn-danger w-full">Tolak & hapus dokumen</SubmitButton>
      </form>
    </div>
  );
}
