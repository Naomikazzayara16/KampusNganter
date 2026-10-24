"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeIndonesianPhone } from "@/domain/phone";
import { env } from "@/lib/env";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { firstError, formToObject, otpForm, phoneForm, profileForm } from "@/lib/validation";
import { safeNextPath } from "@/lib/redirect";
import { requireUser } from "@/server/auth";
import { fail, ok, type ActionResult, type ActionState } from "@/server/result";

function hmac(value: string): string {
  return createHmac("sha256", env().OTP_HASH_SECRET).update(value).digest("hex");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type OtpState = (ActionResult & { phone?: string }) | null;

export async function requestOtp(_prev: OtpState, form: FormData): Promise<OtpState> {
  const parsed = phoneForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const phone = normalizeIndonesianPhone(parsed.data.phone);
  if (!phone) return fail("Masukkan nomor HP Indonesia, misalnya 0812xxxxxxxx.");

  const { data: allowed, error } = await createServiceClient().rpc("otp_rate_check", {
    p_phone_hash: hmac(phone),
    p_ip_hash: hmac(await clientIp()),
  });
  if (error) return fail("Terjadi kesalahan. Coba lagi sebentar lagi.");
  if (!allowed) return fail("Terlalu banyak permintaan kode. Tunggu 15 menit lalu coba lagi.");

  const supabase = await createSessionClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
  if (otpError) {
    console.error("[otp]", otpError.message);
    return fail("Kode OTP gagal dikirim. Coba lagi beberapa saat lagi.");
  }
  return { ...ok("Kode OTP sudah dikirim. Berlaku beberapa menit."), phone };
}

export async function verifyOtp(_prev: OtpState, form: FormData): Promise<OtpState> {
  const parsed = otpForm.safeParse(formToObject(form));
  if (!parsed.success) return { ...fail(firstError(parsed.error)), phone: String(form.get("phone") ?? "") };
  const phone = normalizeIndonesianPhone(parsed.data.phone);
  if (!phone) return fail("Nomor HP tidak valid.");

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: parsed.data.token, type: "sms" });
  if (error) {
    // Pesan sama untuk kode salah atau kedaluwarsa, supaya tidak membantu penebak.
    return { ...fail("Kode salah atau sudah kedaluwarsa."), phone };
  }
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileForm.safeParse(formToObject(form));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);
  if (error) return fail("Gagal menyimpan nama.");
  return ok("Nama tersimpan.");
}
