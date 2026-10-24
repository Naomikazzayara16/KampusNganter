import type { ProofView } from "@/server/queries/orders";

const LABELS: Record<string, string> = {
  receipt: "Struk / bukti harga",
  handover: "Serah terima",
  store_closed: "Toko tutup",
};

export function ProofGallery({ proofs }: { proofs: ProofView[] }) {
  if (proofs.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {proofs.map((p) =>
        p.url ? (
          <figure key={p.id} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- link sementara dari bucket privat */}
            <img src={p.url} alt={LABELS[p.kind] ?? p.kind} className="aspect-square w-full rounded-xl object-cover" />
            <figcaption className="text-xs text-stone-600">{LABELS[p.kind] ?? p.kind}</figcaption>
          </figure>
        ) : null,
      )}
    </div>
  );
}
