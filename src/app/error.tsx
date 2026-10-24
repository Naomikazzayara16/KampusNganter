"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card space-y-3 text-center">
      <h1 className="text-lg font-bold">Terjadi kesalahan</h1>
      <p className="text-sm text-stone-600">Coba muat ulang. Kalau masih terjadi, hubungi admin.</p>
      <button type="button" onClick={reset} className="btn w-full">
        Coba lagi
      </button>
    </div>
  );
}
