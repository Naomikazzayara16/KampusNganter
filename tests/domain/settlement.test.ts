import { describe, expect, it } from "vitest";
import { SettlementError, settleCancellation, settleCompletedOrder } from "@/domain/settlement";

const base = { deliveryFee: 8000, buyerServiceFee: 1000, itemBudget: 50000 };

describe("settleCompletedOrder", () => {
  it("mengembalikan sisa budget dan membayar driver ongkir + belanja − Rp1.000", () => {
    const s = settleCompletedOrder({ ...base, itemTotal: 32000, waitFee: 1500 });
    expect(s.driverEarning).toBe(8000 + 32000 + 1500 - 1000);
    expect(s.buyerRefund).toBe(50000 - 32000 - 1500);
    expect(s.platformFee).toBe(2000);
  });

  it("uang masuk = uang keluar (tidak ada rupiah yang hilang)", () => {
    const itemTotal = 41000;
    const wait = 3000;
    const s = settleCompletedOrder({ ...base, itemTotal, waitFee: wait });
    const paid = base.deliveryFee + base.buyerServiceFee + base.itemBudget;
    expect(s.driverEarning + s.buyerRefund + s.platformFee).toBe(paid);
  });

  it("menolak total belanja di atas budget", () => {
    expect(() => settleCompletedOrder({ ...base, itemTotal: 50001, waitFee: 0 })).toThrow(
      SettlementError,
    );
  });
});

describe("settleCancellation", () => {
  const paid = base.deliveryFee + base.buyerServiceFee + base.itemBudget;

  it("refund penuh sebelum ada driver", () => {
    const s = settleCancellation({ ...base, reason: "before_driver" });
    expect(s).toEqual({ driverEarning: 0, buyerRefund: paid, platformFee: 0 });
  });

  it("toko tutup: driver 50% ongkir, biaya layanan buyer dikembalikan", () => {
    const s = settleCancellation({ ...base, reason: "store_closed" });
    expect(s.driverEarning).toBe(4000);
    expect(s.buyerRefund).toBe(4000 + 50000 + 1000);
    expect(s.platformFee).toBe(0);
  });

  it("buyer batal saat driver di jalan: biaya layanan tetap ditarik", () => {
    const s = settleCancellation({ ...base, reason: "buyer_driver_en_route" });
    expect(s.driverEarning).toBe(4000);
    expect(s.platformFee).toBe(1000);
  });

  it("selalu seimbang untuk semua alasan", () => {
    for (const reason of [
      "before_driver",
      "buyer_soon_after_claim",
      "buyer_driver_en_route",
      "store_closed",
      "driver_fault",
    ] as const) {
      const s = settleCancellation({ ...base, deliveryFee: 9500, reason });
      expect(s.driverEarning + s.buyerRefund + s.platformFee).toBe(9500 + 1000 + 50000);
    }
  });
});
