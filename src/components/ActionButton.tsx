"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/server/result";
import { FormMessage } from "./FormMessage";

/** Tombol untuk server action tanpa form, dengan konfirmasi opsional. */
export function ActionButton({
  action,
  children,
  confirmText,
  className = "btn w-full",
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          startTransition(async () => setState(await action()));
        }}
      >
        {pending ? "Memproses…" : children}
      </button>
      <FormMessage state={state} />
    </div>
  );
}
