import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card space-y-3 text-center">
      <h1 className="text-lg font-bold">Halaman tidak ditemukan</h1>
      <Link href="/" className="btn-secondary w-full">
        Kembali ke beranda
      </Link>
    </div>
  );
}
