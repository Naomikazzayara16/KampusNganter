import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

/**
 * Klien atas nama pengguna yang sedang login. Semua bacaan memakai klien ini
 * sehingga Row Level Security di database ikut menjaga.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = env();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component: cookie diperbarui oleh proxy.ts.
        }
      },
    },
  });
}

/**
 * Klien server dengan kunci rahasia. Hanya untuk fungsi tulis di database dan
 * penyimpanan file, setelah hak akses pengguna dicek di kode pemanggil.
 */
export function createServiceClient(): SupabaseClient {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
