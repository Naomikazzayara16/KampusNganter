const HIDDEN = "[disembunyikan]";

const PATTERNS: RegExp[] = [
  // Tautan dan domain
  /\bhttps?:\/\/\S+/gi,
  /\bwww\.\S+/gi,
  /\b[a-z0-9-]+\.(?:com|id|co\.id|me|link|ly|io|net|org)\b\S*/gi,
  // Username IG / Telegram
  /(?<![\w.])@[a-z0-9._]{3,30}/gi,
  // Nomor telepon: 8+ digit, boleh diselingi spasi, titik, atau tanda hubung
  /(?:\+?\d[\s.-]?){8,}\d/g,
];

/**
 * Menyembunyikan nomor HP, username, dan tautan dari teks bebas
 * (catatan order, nanti chat) agar transaksi tidak pindah ke luar platform.
 */
export function redactContactInfo(text: string): string {
  return PATTERNS.reduce((acc, re) => acc.replace(re, HIDDEN), text);
}
