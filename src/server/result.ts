export type ActionResult = { ok: boolean; message: string };
export type ActionState = ActionResult | null;

export const ok = (message: string): ActionResult => ({ ok: true, message });
export const fail = (message: string): ActionResult => ({ ok: false, message });

/** Pesan galat dari fungsi database → pesan yang bisa dibaca pengguna. */
const DB_MESSAGES: Record<string, string> = {
  order_taken: "Order sudah diambil driver lain.",
  driver_busy: "Kamu sudah memegang 2 order. Selesaikan dulu salah satunya.",
  driver_offline: "Nyalakan status ON dulu sebelum mengambil order.",
  driver_not_active: "Akun driver kamu belum aktif.",
  wrong_zone: "Order ini di luar zona yang kamu pilih.",
  own_order: "Kamu tidak bisa mengambil order sendiri.",
  stale_status: "Status order sudah berubah. Muat ulang halaman.",
  invalid_transition: "Langkah ini tidak bisa dilakukan pada status sekarang.",
  forbidden: "Kamu tidak punya akses untuk langkah ini.",
  amount_mismatch: "Nominal tidak sama dengan tagihan order.",
  receipt_required: "Unggah foto struk atau bukti harga dulu.",
  handover_required: "Unggah foto serah terima dulu.",
  unbalanced_settlement: "Perhitungan dana tidak seimbang. Hubungi admin.",
  refund_mismatch: "Perhitungan sisa dana tidak cocok. Hubungi admin.",
  application_not_pending: "Pendaftaran ini sudah diproses.",
  documents_incomplete: "Dokumen pendaftar belum lengkap (KTM, KTP, SIM, STNK).",
  orders_item_total_within_budget: "Total belanja melebihi budget buyer. Minta buyer menambah dana.",
};

export function dbErrorMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  for (const [code, msg] of Object.entries(DB_MESSAGES)) {
    if (raw.includes(code)) return msg;
  }
  // Jangan bocorkan detail database ke pengguna; catat di log server saja.
  console.error("[db]", raw);
  return "Terjadi kesalahan. Coba lagi sebentar lagi.";
}
