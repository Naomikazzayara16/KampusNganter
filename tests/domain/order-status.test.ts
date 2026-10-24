import { describe, expect, it } from "vitest";
import { canTransition, nextDriverStep } from "@/domain/order-status";

describe("canTransition", () => {
  it("hanya admin yang bisa mengonfirmasi pembayaran", () => {
    expect(canTransition("awaiting_payment", "searching_driver", "admin", "beli")).toBe(true);
    expect(canTransition("awaiting_payment", "searching_driver", "buyer", "beli")).toBe(false);
    expect(canTransition("awaiting_payment", "searching_driver", "driver", "beli")).toBe(false);
  });

  it("driver tidak bisa melompati status", () => {
    expect(canTransition("driver_assigned", "arrived", "driver", "beli")).toBe(false);
    expect(canTransition("searching_driver", "completed", "driver", "beli")).toBe(false);
  });

  it("status 'Sudah dibeli' hanya untuk titip beli", () => {
    expect(canTransition("at_pickup", "purchased", "driver", "beli")).toBe(true);
    expect(canTransition("at_pickup", "purchased", "driver", "antar_ambil")).toBe(false);
    expect(canTransition("at_pickup", "on_the_way", "driver", "antar_ambil")).toBe(true);
    expect(canTransition("at_pickup", "on_the_way", "driver", "beli")).toBe(false);
  });

  it("buyer tidak bisa membatalkan setelah driver mengambil order", () => {
    expect(canTransition("searching_driver", "cancelled", "buyer", "beli")).toBe(true);
    expect(canTransition("driver_assigned", "cancelled", "buyer", "beli")).toBe(false);
  });

  it("status akhir tidak bisa diubah", () => {
    expect(canTransition("completed", "cancelled", "admin", "beli")).toBe(false);
    expect(canTransition("cancelled", "searching_driver", "admin", "beli")).toBe(false);
  });
});

describe("nextDriverStep", () => {
  it("mengikuti alur titip beli", () => {
    expect(nextDriverStep("driver_assigned", "beli")).toBe("at_pickup");
    expect(nextDriverStep("at_pickup", "beli")).toBe("purchased");
    expect(nextDriverStep("purchased", "beli")).toBe("on_the_way");
    expect(nextDriverStep("on_the_way", "beli")).toBe("arrived");
    expect(nextDriverStep("arrived", "beli")).toBeNull();
  });

  it("antar/ambil melewati 'Sudah dibeli'", () => {
    expect(nextDriverStep("at_pickup", "antar_ambil")).toBe("on_the_way");
  });
});
