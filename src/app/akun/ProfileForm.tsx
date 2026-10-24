"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { updateProfile } from "@/server/actions/auth";
import type { ActionState } from "@/server/result";

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfile, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="displayName" className="label">
          Nama panggilan (dilihat driver)
        </label>
        <input id="displayName" name="displayName" defaultValue={displayName} required maxLength={40} className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Simpan</SubmitButton>
    </form>
  );
}
