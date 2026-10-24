import { assertRupiah, type Rupiah } from "./money";
import { TARIFF } from "./pricing";

export type SettlementInput = {
  deliveryFee: Rupiah;
  buyerServiceFee: Rupiah;
  itemBudget: Rupiah;
  /** Total belanja yang diketik driver (0 untuk antar/ambil). */
  itemTotal: Rupiah;
  waitFee: Rupiah;
};

export type Settlement = {
  /** Masuk ke saldo driver: ongkir + penggantian belanja + biaya tunggu − biaya layanan driver. */
  driverEarning: Rupiah;
  /** Dikembalikan ke buyer: sisa budget belanja setelah belanja dan biaya tunggu. */
  buyerRefund: Rupiah;
  /** Pendapatan platform: biaya layanan buyer + driver. */
  platformFee: Rupiah;
};

export class SettlementError extends Error {}

export function settleCompletedOrder(input: SettlementInput): Settlement {
  const { deliveryFee, buyerServiceFee, itemBudget, itemTotal, waitFee } = input;
  if (itemTotal > itemBudget) {
    throw new SettlementError("Total belanja melebihi budget buyer.");
  }
  const remaining = itemBudget - itemTotal;
  if (waitFee > remaining) {
    // Biaya tunggu dibayar dari sisa budget; kalau tidak cukup, admin harus menagih manual.
    throw new SettlementError("Sisa budget tidak cukup untuk biaya tunggu.");
  }
  return {
    driverEarning: assertRupiah(deliveryFee + itemTotal + waitFee - TARIFF.driverServiceFee),
    buyerRefund: assertRupiah(remaining - waitFee),
    platformFee: assertRupiah(buyerServiceFee + TARIFF.driverServiceFee),
  };
}

export const CANCEL_REASONS = [
  "before_driver",
  "buyer_soon_after_claim",
  "buyer_driver_en_route",
  "store_closed",
  "driver_fault",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  before_driver: "Batal sebelum ada driver",
  buyer_soon_after_claim: "Buyer batal < 5 menit setelah driver ambil",
  buyer_driver_en_route: "Buyer batal saat driver sudah di jalan",
  store_closed: "Toko tutup / barang habis (ada foto bukti)",
  driver_fault: "Driver batal / kesalahan driver",
};

export type CancellationInput = {
  reason: CancelReason;
  deliveryFee: Rupiah;
  buyerServiceFee: Rupiah;
  itemBudget: Rupiah;
};

/** Aturan refund sesuai tabel "Toko tutup, refund & pembatalan" di rancangan. */
export function settleCancellation(input: CancellationInput): Settlement {
  const { reason, deliveryFee, buyerServiceFee, itemBudget } = input;
  const half = Math.floor(deliveryFee / 2);
  const full = deliveryFee + buyerServiceFee + itemBudget;

  switch (reason) {
    case "before_driver":
    case "buyer_soon_after_claim":
    case "driver_fault":
      return { driverEarning: 0, buyerRefund: assertRupiah(full), platformFee: 0 };
    case "buyer_driver_en_route":
      return {
        driverEarning: assertRupiah(half),
        buyerRefund: assertRupiah(deliveryFee - half + itemBudget),
        platformFee: assertRupiah(buyerServiceFee),
      };
    case "store_closed":
      return {
        driverEarning: assertRupiah(half),
        buyerRefund: assertRupiah(deliveryFee - half + itemBudget + buyerServiceFee),
        platformFee: 0,
      };
  }
}
