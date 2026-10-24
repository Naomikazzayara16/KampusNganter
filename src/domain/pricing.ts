import { assertRupiah, type Rupiah } from "./money";

export const SERVICE_TYPES = ["antar_ambil", "beli"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  antar_ambil: "Antar / ambil barang",
  beli: "Beli makanan / barang (titip beli)",
};

/** Tarif sesuai keputusan 24 Okt 2026 (Jatinangor). Ubah di sini saja. */
export const TARIFF = {
  includedMeters: 2000,
  perExtraKm: 1500,
  base: {
    antar_ambil: 5000,
    beli: 8000,
  } satisfies Record<ServiceType, Rupiah>,
  /** Menit tunggu di toko yang sudah termasuk tarif dasar. */
  freeWaitMinutes: { antar_ambil: 5, beli: 10 } satisfies Record<ServiceType, number>,
  waitFeePerBlock: 1500,
  waitBlockMinutes: 5,
  /** Batas total waktu tunggu yang ditagih, melindungi buyer dari tagihan tak terduga. */
  maxBillableWaitMinutes: 20,
  extraStoreFee: 2000,
  buyerServiceFee: 1000,
  driverServiceFee: 1000,
  /** Jarak maksimum satu order, mencegah input koordinat yang tidak masuk akal. */
  maxMeters: 15000,
  maxExtraStores: 2,
  maxItemBudget: 500000,
} as const;

export type QuoteInput = {
  service: ServiceType;
  distanceMeters: number;
  extraStores?: number;
  itemBudget?: Rupiah;
};

export type Quote = {
  service: ServiceType;
  distanceMeters: number;
  baseFee: Rupiah;
  distanceFee: Rupiah;
  extraStoreFee: Rupiah;
  deliveryFee: Rupiah;
  buyerServiceFee: Rupiah;
  itemBudget: Rupiah;
  /** Total yang dibayar buyer sebelum kode unik. */
  total: Rupiah;
};

export class PricingError extends Error {}

export function quote(input: QuoteInput): Quote {
  const { service, distanceMeters } = input;
  const extraStores = input.extraStores ?? 0;
  const itemBudget = input.itemBudget ?? 0;

  if (!Number.isInteger(distanceMeters) || distanceMeters < 0) {
    throw new PricingError("Jarak tidak valid.");
  }
  if (distanceMeters > TARIFF.maxMeters) {
    throw new PricingError("Jarak terlalu jauh untuk satu order.");
  }
  if (!Number.isInteger(extraStores) || extraStores < 0 || extraStores > TARIFF.maxExtraStores) {
    throw new PricingError("Jumlah toko tambahan tidak valid.");
  }
  if (!Number.isSafeInteger(itemBudget) || itemBudget < 0 || itemBudget > TARIFF.maxItemBudget) {
    throw new PricingError("Budget belanja tidak valid.");
  }
  if (service === "antar_ambil" && (extraStores > 0 || itemBudget > 0)) {
    throw new PricingError("Antar/ambil barang tidak memakai toko tambahan atau budget belanja.");
  }
  if (service === "beli" && itemBudget === 0) {
    throw new PricingError("Titip beli butuh budget belanja.");
  }

  const extraMeters = Math.max(0, distanceMeters - TARIFF.includedMeters);
  const extraKm = Math.ceil(extraMeters / 1000);

  const baseFee = TARIFF.base[service];
  const distanceFee = extraKm * TARIFF.perExtraKm;
  const extraStoreFee = extraStores * TARIFF.extraStoreFee;
  const deliveryFee = baseFee + distanceFee + extraStoreFee;
  const buyerServiceFee = TARIFF.buyerServiceFee;

  return {
    service,
    distanceMeters,
    baseFee: assertRupiah(baseFee),
    distanceFee: assertRupiah(distanceFee),
    extraStoreFee: assertRupiah(extraStoreFee),
    deliveryFee: assertRupiah(deliveryFee),
    buyerServiceFee: assertRupiah(buyerServiceFee),
    itemBudget: assertRupiah(itemBudget),
    total: assertRupiah(deliveryFee + buyerServiceFee + itemBudget),
  };
}

/**
 * Biaya tunggu dihitung dari "Sampai toko" sampai "Sudah dibeli".
 * Setiap 5 menit yang sudah dimulai setelah waktu gratis ditagih Rp1.500,
 * dengan total waktu tunggu yang ditagih dibatasi.
 */
export function waitFee(service: ServiceType, waitedMinutes: number): Rupiah {
  if (!Number.isFinite(waitedMinutes) || waitedMinutes < 0) {
    throw new PricingError("Durasi tunggu tidak valid.");
  }
  if (service !== "beli") return 0;
  const billable =
    Math.min(waitedMinutes, TARIFF.maxBillableWaitMinutes) - TARIFF.freeWaitMinutes[service];
  if (billable <= 0) return 0;
  return Math.ceil(billable / TARIFF.waitBlockMinutes) * TARIFF.waitFeePerBlock;
}
