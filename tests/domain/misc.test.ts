import { describe, expect, it } from "vitest";
import { checkUpload, sniffMime } from "@/domain/files";
import { estimatedRoadMeters } from "@/domain/geo";
import { formatRupiah } from "@/domain/money";
import { amountToPay, pickUniqueCode } from "@/domain/payment";
import { maskPhone, normalizeIndonesianPhone } from "@/domain/phone";
import { redactContactInfo } from "@/domain/redact";

describe("normalizeIndonesianPhone", () => {
  it.each([
    ["081234567890", "+6281234567890"],
    ["+62 812-3456-7890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
  ])("%s → %s", (input, out) => {
    expect(normalizeIndonesianPhone(input)).toBe(out);
  });

  it.each(["", "12345", "0211234567", "+1 415 555 0100", "08123", "08abc4567890"])(
    "menolak %s",
    (input) => {
      expect(normalizeIndonesianPhone(input)).toBeNull();
    },
  );

  it("menyamarkan nomor", () => {
    expect(maskPhone("+6281234567890")).toBe("+62 812-****-7890");
  });
});

describe("kode unik pembayaran", () => {
  it("tidak memakai kode yang sedang dipakai", () => {
    const taken = new Set(Array.from({ length: 998 }, (_, i) => i + 1));
    expect(pickUniqueCode(taken)).toBe(999);
  });

  it("gagal bila semua kode terpakai", () => {
    const taken = new Set(Array.from({ length: 999 }, (_, i) => i + 1));
    expect(() => pickUniqueCode(taken)).toThrow();
  });

  it("menambahkan kode ke total, sesuai contoh Rp31.037", () => {
    expect(amountToPay(31000, 37)).toBe(31037);
    expect(() => amountToPay(31000, 0)).toThrow();
  });
});

describe("formatRupiah", () => {
  it("memakai format Indonesia", () => {
    expect(formatRupiah(31037)).toBe("Rp 31.037");
  });
});

describe("estimatedRoadMeters", () => {
  it("garis lurus × 1,3", () => {
    // ±1 km ke utara
    const m = estimatedRoadMeters({ lat: -6.93, lng: 107.77 }, { lat: -6.921, lng: 107.77 });
    expect(m).toBeGreaterThan(1250);
    expect(m).toBeLessThan(1350);
  });
});

describe("unggahan", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7 ...");
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");

  it("mengenali tipe dari isi file", () => {
    expect(sniffMime(jpeg)).toBe("image/jpeg");
    expect(sniffMime(pdf)).toBe("application/pdf");
    expect(sniffMime(html)).toBeNull();
  });

  it("menolak file berbahaya, kosong, atau terlalu besar", () => {
    expect(checkUpload(html).ok).toBe(false);
    expect(checkUpload(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkUpload(big).ok).toBe(false);
    expect(checkUpload(pdf, { imagesOnly: true }).ok).toBe(false);
  });
});

describe("redactContactInfo", () => {
  it("menyembunyikan nomor, username, dan tautan", () => {
    const out = redactContactInfo(
      "Chat aku di 0812-3456-7890 atau @kampus.anak, cek https://wa.me/62812 ya. Gedung 2 lt 3",
    );
    expect(out).not.toMatch(/0812|@kampus|wa\.me/);
    expect(out).toContain("Gedung 2 lt 3");
  });
});
