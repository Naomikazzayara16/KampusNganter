export const ALLOWED_UPLOADS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type AllowedMime = keyof typeof ALLOWED_UPLOADS;

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Menentukan tipe file dari isinya (magic bytes), bukan dari nama atau
 * header Content-Type yang bisa dipalsukan oleh pengirim.
 */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const starts = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type UploadCheck =
  | { ok: true; mime: AllowedMime; ext: string }
  | { ok: false; error: string };

export function checkUpload(
  bytes: Uint8Array,
  options: { imagesOnly?: boolean } = {},
): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "File kosong." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "Ukuran file maksimal 4 MB." };
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, error: "Format file harus JPG, PNG, WEBP, atau PDF." };
  if (options.imagesOnly && mime === "application/pdf") {
    return { ok: false, error: "Bukti harus berupa foto (JPG, PNG, atau WEBP)." };
  }
  return { ok: true, mime, ext: ALLOWED_UPLOADS[mime] };
}
