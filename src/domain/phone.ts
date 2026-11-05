/**
 * Menormalkan nomor HP Indonesia ke format E.164 (+62…).
 * Menerima 08…, 628…, +628…, dengan spasi atau tanda hubung.
 * Mengembalikan null bila bukan nomor seluler Indonesia yang masuk akal.
 */
export function normalizeIndonesianPhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  let digits: string;
  if (compact.startsWith("+62")) digits = compact.slice(3);
  else if (compact.startsWith("62")) digits = compact.slice(2);
  else if (compact.startsWith("0")) digits = compact.slice(1);
  else return null;

  // Nomor seluler Indonesia diawali 8 dan totalnya 9–12 digit setelah kode negara.
  if (!/^8\d{8,11}$/.test(digits)) return null;
  return `+62${digits}`;
}

/** Untuk ditampilkan ke pemilik nomor saja, mis. "+62 812-****-7890". */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+62/, "");
  if (local.length < 7) return "+62 ****";
  return `+62 ${local.slice(0, 3)}-****-${local.slice(-4)}`;
}
