import "server-only";
import { randomUUID } from "node:crypto";
import { checkUpload } from "@/domain/files";
import { createServiceClient } from "@/lib/supabase/server";

export type Bucket = "driver-documents" | "order-proofs";

/** Link sementara untuk melihat file privat. */
export const SIGNED_URL_SECONDS = 300;

export type StoredFile = { path: string; mime: string; size: number };

/**
 * Mengunggah file ke bucket privat. Tipe file ditentukan dari isinya,
 * nama file asli dibuang dan diganti nama acak.
 */
export async function storePrivateFile(
  bucket: Bucket,
  folder: string,
  prefix: string,
  file: unknown,
  options: { imagesOnly?: boolean } = {},
): Promise<{ ok: true; file: StoredFile } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file dulu." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload(bytes, options);
  if (!check.ok) return check;

  const path = `${folder}/${prefix}-${randomUUID()}.${check.ext}`;
  const { error } = await createServiceClient()
    .storage.from(bucket)
    .upload(path, bytes, { contentType: check.mime, upsert: false, cacheControl: "private, max-age=0" });
  if (error) {
    console.error("[storage]", error.message);
    return { ok: false, error: "Gagal mengunggah file. Coba lagi." };
  }
  return { ok: true, file: { path, mime: check.mime, size: bytes.length } };
}

export async function signedUrl(bucket: Bucket, path: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await createServiceClient().storage.from(bucket).remove(paths);
  if (error) throw new Error(`Gagal menghapus file: ${error.message}`);
}
