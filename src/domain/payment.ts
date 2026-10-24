import { randomInt } from "node:crypto";
import { assertRupiah, type Rupiah } from "./money";

/**
 * Kode unik 1–999 ditambahkan ke tagihan agar admin bisa mencocokkan
 * mutasi QRIS dengan order. Kode hanya unik di antara order yang sedang
 * menunggu pembayaran; database menjaga ini dengan unique index parsial.
 */
export const UNIQUE_CODE_MIN = 1;
export const UNIQUE_CODE_MAX = 999;

/** Batas waktu pembayaran sesuai rancangan. */
export const PAYMENT_WINDOW_MINUTES = 15;

export function pickUniqueCode(taken: ReadonlySet<number>): number {
  const capacity = UNIQUE_CODE_MAX - UNIQUE_CODE_MIN + 1;
  if (taken.size >= capacity) {
    throw new Error("Semua kode unik sedang dipakai. Coba lagi beberapa menit lagi.");
  }
  // Coba acak dulu agar kode tidak bisa ditebak, lalu jatuh ke pencarian linear.
  for (let i = 0; i < 20; i++) {
    const code = randomInt(UNIQUE_CODE_MIN, UNIQUE_CODE_MAX + 1);
    if (!taken.has(code)) return code;
  }
  for (let code = UNIQUE_CODE_MIN; code <= UNIQUE_CODE_MAX; code++) {
    if (!taken.has(code)) return code;
  }
  throw new Error("Kode unik tidak tersedia.");
}

export function amountToPay(total: Rupiah, uniqueCode: number): Rupiah {
  if (!Number.isInteger(uniqueCode) || uniqueCode < UNIQUE_CODE_MIN || uniqueCode > UNIQUE_CODE_MAX) {
    throw new RangeError("Kode unik tidak valid.");
  }
  return assertRupiah(total + uniqueCode);
}

export function paymentDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);
}
