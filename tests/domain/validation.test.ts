import { describe, expect, it } from "vitest";
import { firstError, orderForm, phoneForm } from "@/lib/validation";
import { safeNextPath as safeNextPathForTest } from "@/lib/redirect";

describe("validasi form", () => {
  it("pesan galat berbahasa Indonesia", () => {
    const r = phoneForm.safeParse({ phone: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toBe("Nomor HP terlalu pendek.");
  });

  it("order tanpa titik peta ditolak dengan petunjuk", () => {
    const r = orderForm.safeParse({
      service: "antar_ambil",
      zoneId: "1",
      pickupLabel: "Kos A",
      dropoffLabel: "Kos B",
      details: "Dokumen",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toMatch(/peta/);
  });

  it("titip beli wajib punya budget", () => {
    const r = orderForm.safeParse({
      service: "beli",
      zoneId: "1",
      pickupLabel: "Warung",
      pickupLat: "-6.93",
      pickupLng: "107.77",
      dropoffLabel: "Kos",
      dropoffLat: "-6.92",
      dropoffLng: "107.77",
      details: "Nasi",
    });
    expect(r.success).toBe(false);
  });

  it("membuang karakter kontrol dari teks bebas", () => {
    const r = orderForm.safeParse({
      service: "antar_ambil",
      zoneId: "1",
      pickupLabel: "Kos\u0007 A",
      pickupLat: "-6.93",
      pickupLng: "107.77",
      dropoffLabel: "Kos B",
      dropoffLat: "-6.92",
      dropoffLng: "107.77",
      details: "Dokumen",
    });
    expect(r.success && r.data.pickupLabel).toBe("Kos A");
  });
});

describe("safeNextPath (mencegah open redirect)", () => {
  it.each([
    ["/pesanan/abc", "/pesanan/abc"],
    ["https://jahat.com", "/pesanan"],
    ["//jahat.com", "/pesanan"],
    ["/\\jahat.com", "/pesanan"],
    [undefined, "/pesanan"],
  ])("%s → %s", (input, out) => {
    expect(safeNextPathForTest(input)).toBe(out);
  });
});
