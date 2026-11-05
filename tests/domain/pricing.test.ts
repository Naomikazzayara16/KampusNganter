import { describe, expect, it } from "vitest";
import { PricingError, quote, waitFee } from "@/domain/pricing";

describe("quote", () => {
  it("antar/ambil ≤ 2 km = Rp5.000 + biaya layanan Rp1.000", () => {
    const q = quote({ service: "antar_ambil", distanceMeters: 1800 });
    expect(q.deliveryFee).toBe(5000);
    expect(q.buyerServiceFee).toBe(1000);
    expect(q.total).toBe(6000);
  });

  it("beli makanan ≤ 2 km sesuai contoh rancangan: Rp15.000 + Rp8.000 + Rp1.000 = Rp24.000", () => {
    const q = quote({ service: "beli", distanceMeters: 2000, itemBudget: 15000 });
    expect(q.deliveryFee).toBe(8000);
    expect(q.total).toBe(24000);
  });

  it("menagih Rp1.500 per km berikutnya, dibulatkan ke atas", () => {
    expect(quote({ service: "antar_ambil", distanceMeters: 2001 }).distanceFee).toBe(1500);
    expect(quote({ service: "antar_ambil", distanceMeters: 3000 }).distanceFee).toBe(1500);
    expect(quote({ service: "antar_ambil", distanceMeters: 4500 }).distanceFee).toBe(4500);
  });

  it("menambah Rp2.000 per toko tambahan", () => {
    const q = quote({ service: "beli", distanceMeters: 1000, itemBudget: 20000, extraStores: 2 });
    expect(q.extraStoreFee).toBe(4000);
    expect(q.deliveryFee).toBe(12000);
  });

  it("menolak input yang tidak masuk akal", () => {
    expect(() => quote({ service: "antar_ambil", distanceMeters: -1 })).toThrow(PricingError);
    expect(() => quote({ service: "antar_ambil", distanceMeters: 1.5 })).toThrow(PricingError);
    expect(() => quote({ service: "antar_ambil", distanceMeters: 99_000 })).toThrow(PricingError);
    expect(() => quote({ service: "beli", distanceMeters: 1000 })).toThrow(PricingError);
    expect(() => quote({ service: "beli", distanceMeters: 1000, itemBudget: 600_000 })).toThrow(
      PricingError,
    );
    expect(() => quote({ service: "antar_ambil", distanceMeters: 1000, itemBudget: 1000 })).toThrow(
      PricingError,
    );
  });
});

describe("waitFee", () => {
  it("gratis sampai 10 menit untuk beli makanan", () => {
    expect(waitFee("beli", 0)).toBe(0);
    expect(waitFee("beli", 10)).toBe(0);
  });

  it("Rp1.500 per 5 menit yang sudah dimulai setelah 10 menit", () => {
    expect(waitFee("beli", 10.5)).toBe(1500);
    expect(waitFee("beli", 15)).toBe(1500);
    expect(waitFee("beli", 16)).toBe(3000);
  });

  it("dibatasi 20 menit (maks. Rp3.000), sesuai contoh toko ramai di rancangan", () => {
    expect(waitFee("beli", 20)).toBe(3000);
    expect(waitFee("beli", 90)).toBe(3000);
  });

  it("antar/ambil tidak punya biaya tunggu", () => {
    expect(waitFee("antar_ambil", 30)).toBe(0);
  });
});
