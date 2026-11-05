import "server-only";
import { z } from "zod";

/**
 * Semua rahasia dibaca dari environment variable di server, divalidasi sekali.
 * Tidak ada variabel NEXT_PUBLIC_ untuk Supabase: browser tidak pernah
 * berbicara langsung dengan database.
 */
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Kunci HMAC untuk menyamarkan nomor HP dan IP di tabel batas OTP. */
  OTP_HASH_SECRET: z.string().min(32),
  /** URL gambar QRIS usaha. Kosong = tampilkan petunjuk ke admin. */
  QRIS_IMAGE_URL: z.url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse({
      ...process.env,
      QRIS_IMAGE_URL: process.env.QRIS_IMAGE_URL || undefined,
    });
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Konfigurasi server tidak lengkap: ${missing}. Lihat .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
