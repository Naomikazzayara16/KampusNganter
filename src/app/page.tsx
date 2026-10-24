import Link from "next/link";
import { formatRupiah } from "@/domain/money";
import { TARIFF } from "@/domain/pricing";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight">Titip beli & antar barang, oleh sesama mahasiswa.</h1>
        <p className="text-stone-600">
          Harga makanan sama dengan beli langsung di warung. Driver adalah mahasiswa aktif yang sudah
          diverifikasi (KTM, KTP, SIM, STNK, dan wawancara).
        </p>
        <div className="flex gap-3">
          <Link href="/pesan" className="btn flex-1">
            Pesan sekarang
          </Link>
          <Link href="/driver/daftar" className="btn-secondary flex-1">
            Jadi driver
          </Link>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Tarif Jatinangor</h2>
        <ul className="space-y-1 text-sm text-stone-700">
          <li>Antar / ambil barang: {formatRupiah(TARIFF.base.antar_ambil)} (0–2 km)</li>
          <li>Beli makanan / barang: {formatRupiah(TARIFF.base.beli)} (0–2 km, termasuk tunggu 10 menit)</li>
          <li>Per km berikutnya: {formatRupiah(TARIFF.perExtraKm)}</li>
          <li>Biaya tunggu: {formatRupiah(TARIFF.waitFeePerBlock)} per 5 menit setelah 10 menit</li>
          <li>Biaya layanan: {formatRupiah(TARIFF.buyerServiceFee)} per order</li>
        </ul>
      </section>

      <section className="card space-y-2 text-sm text-stone-700">
        <h2 className="font-semibold text-stone-900">Uangmu aman</h2>
        <p>
          Kamu membayar ke QRIS usaha KampusNganter, bukan ke driver. Dana baru diteruskan ke driver
          setelah kamu menekan &ldquo;Terima&rdquo;. Kalau toko tutup, dana dikembalikan.
        </p>
        <p>Nomor HP-mu tidak pernah dibagikan ke driver.</p>
      </section>
    </div>
  );
}
