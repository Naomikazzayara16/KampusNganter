"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { requestOtp, verifyOtp, type OtpState } from "@/server/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [sent, sendAction] = useActionState<OtpState, FormData>(requestOtp, null);
  const [verified, verifyAction] = useActionState<OtpState, FormData>(verifyOtp, null);
  const phone = verified?.phone || sent?.phone;

  if (!phone) {
    return (
      <form action={sendAction} className="space-y-4">
        <div>
          <label htmlFor="phone" className="label">
            Nomor HP
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812xxxxxxxx"
            required
            className="input"
          />
        </div>
        <FormMessage state={sent} />
        <SubmitButton pendingText="Mengirim kode…">Kirim kode OTP</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <FormMessage state={verified ?? sent} />
      <div>
        <label htmlFor="token" className="label">
          Kode OTP (6 angka)
        </label>
        <input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="input tracking-[0.5em]"
        />
      </div>
      <SubmitButton pendingText="Memeriksa…">Masuk</SubmitButton>
    </form>
  );
}
