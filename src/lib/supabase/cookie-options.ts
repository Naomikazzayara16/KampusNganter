import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookie sesi tidak perlu dibaca JavaScript di browser (browser tidak memanggil
 * Supabase langsung), jadi dibuat httpOnly agar tidak bisa dicuri lewat XSS.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
