import { z } from "zod";
import { CANCEL_REASONS } from "@/domain/settlement";
import { ORDER_STATUSES } from "@/domain/order-status";
import { SERVICE_TYPES, TARIFF } from "@/domain/pricing";

// Pesan validasi bawaan dalam bahasa Indonesia.
z.config(z.locales.id());

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Minimal ${min} karakter.`)
    .max(max, `Maksimal ${max} karakter.`)
    // Buang karakter kontrol agar teks aman ditampilkan dan dicatat.
    .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));

const rupiah = (max: number) =>
  z.coerce.number().int("Harus bilangan bulat.").min(0).max(max);

const MAP_HINT = "Pilih titik ambil dan titik antar di peta.";
const lat = z.coerce.number({ error: MAP_HINT }).min(-90, MAP_HINT).max(90, MAP_HINT);
const lng = z.coerce.number({ error: MAP_HINT }).min(-180, MAP_HINT).max(180, MAP_HINT);

export const uuid = z.uuid();

const phoneInput = z
  .string()
  .trim()
  .min(8, "Nomor HP terlalu pendek.")
  .max(20, "Nomor HP terlalu panjang.");

export const phoneForm = z.object({ phone: phoneInput });
export const otpForm = z.object({
  phone: phoneInput,
  token: z.string().trim().regex(/^\d{6}$/, "Kode OTP terdiri dari 6 angka."),
});

export const profileForm = z.object({ displayName: text(2, 40) });

export const orderForm = z
  .object({
    service: z.enum(SERVICE_TYPES),
    zoneId: z.coerce.number().int().positive(),
    pickupLabel: text(3, 120),
    pickupLat: lat,
    pickupLng: lng,
    dropoffLabel: text(3, 120),
    dropoffLat: lat,
    dropoffLng: lng,
    details: text(3, 500),
    itemBudget: rupiah(TARIFF.maxItemBudget).default(0),
    extraStores: z.coerce.number().int().min(0).max(TARIFF.maxExtraStores).default(0),
  })
  .refine((o) => o.service !== "beli" || o.itemBudget >= 1000, {
    path: ["itemBudget"],
    message: "Isi budget belanja maksimal (minimal Rp1.000).",
  });

export const driverApplicationForm = z.object({
  fullName: text(3, 80),
  nim: z.string().trim().regex(/^[A-Za-z0-9.\-]{5,20}$/, "NIM tidak valid."),
  campus: text(2, 80),
  vehicleType: text(2, 40),
  plateNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2} ?[0-9]{1,4} ?[A-Z]{0,3}$/, "Format plat seperti D 1234 ABC."),
  bankName: text(2, 30),
  bankAccountNumber: z.string().trim().regex(/^[0-9]{6,20}$/, "Nomor rekening hanya angka."),
  bankAccountName: text(3, 80),
  consent: z.literal("on", { error: "Persetujuan pemrosesan data wajib dicentang." }),
});

export const documentKind = z.enum(["ktm", "ktp", "sim", "stnk"]);

export const availabilityForm = z.object({
  online: z.enum(["on", "off"]),
  zoneId: z.coerce.number().int().positive(),
  hours: z.coerce.number().int().min(1).max(4).default(2),
});

export const advanceForm = z.object({
  orderId: uuid,
  from: z.enum(ORDER_STATUSES),
  to: z.enum(ORDER_STATUSES),
  itemTotal: rupiah(TARIFF.maxItemBudget).optional(),
});

export const confirmPaymentForm = z.object({
  orderId: uuid,
  amount: rupiah(10_000_000),
  reference: z.string().trim().max(80).optional(),
});

export const adminCancelForm = z.object({
  orderId: uuid,
  reason: z.enum(CANCEL_REASONS),
});

export const reviewDriverForm = z.object({
  userId: uuid,
  decision: z.enum(["approve", "reject"]),
  nickname: text(2, 30).optional(),
  note: z.string().trim().max(300).optional(),
});

export const payoutForm = z.object({
  driverId: uuid,
  amount: z.coerce.number().int().positive().max(10_000_000),
  note: z.string().trim().max(200).optional(),
});

/** FormData → objek biasa; field kosong dianggap tidak diisi. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Data tidak valid.";
}
