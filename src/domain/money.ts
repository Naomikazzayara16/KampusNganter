/**
 * Semua nominal uang disimpan sebagai bilangan bulat rupiah.
 * Tidak ada pecahan, jadi tidak ada galat pembulatan floating point.
 */
export type Rupiah = number;

export function assertRupiah(value: number): Rupiah {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Nominal rupiah tidak valid: ${value}`);
  }
  return value;
}

const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: Rupiah): string {
  // Intl memakai spasi tak terputus; samakan agar mudah dites dan dibaca.
  return formatter.format(value).replace(/ /g, " ");
}
