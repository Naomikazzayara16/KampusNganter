"use client";

import { useActionState, useMemo, useState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { MapPicker } from "@/components/MapPicker";
import { SubmitButton } from "@/components/SubmitButton";
import { estimatedRoadMeters, type LatLng } from "@/domain/geo";
import { formatRupiah } from "@/domain/money";
import { quote, SERVICE_LABELS, SERVICE_TYPES, type ServiceType } from "@/domain/pricing";
import { createOrder } from "@/server/actions/orders";
import type { ActionState } from "@/server/result";

type Zone = { id: number; name: string };

export function OrderForm({ zones }: { zones: Zone[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createOrder, null);
  const [service, setService] = useState<ServiceType>("beli");
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [itemBudget, setItemBudget] = useState(0);
  const [extraStores, setExtraStores] = useState(0);

  // Perkiraan di browser hanya untuk ditampilkan; server menghitung ulang saat order dibuat.
  const estimate = useMemo(() => {
    if (!pickup || !dropoff) return null;
    try {
      return quote({
        service,
        distanceMeters: estimatedRoadMeters(pickup, dropoff),
        extraStores: service === "beli" ? extraStores : 0,
        itemBudget: service === "beli" ? itemBudget : 0,
      });
    } catch (e) {
      return e instanceof Error ? e.message : null;
    }
  }, [service, pickup, dropoff, itemBudget, extraStores]);

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="label">Jenis jasa</legend>
        {SERVICE_TYPES.map((s) => (
          <label key={s} className="card flex cursor-pointer items-center gap-3 p-3">
            <input
              type="radio"
              name="service"
              value={s}
              checked={service === s}
              onChange={() => setService(s)}
            />
            <span>{SERVICE_LABELS[s]}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="zoneId" className="label">
          Zona
        </label>
        <select id="zoneId" name="zoneId" className="input" defaultValue={zones[0]?.id}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </div>

      <MapPicker
        pickup={pickup}
        dropoff={dropoff}
        onChange={(p, v) => (p === "pickup" ? setPickup(v) : setDropoff(v))}
      />
      <input type="hidden" name="pickupLat" value={pickup?.lat ?? ""} />
      <input type="hidden" name="pickupLng" value={pickup?.lng ?? ""} />
      <input type="hidden" name="dropoffLat" value={dropoff?.lat ?? ""} />
      <input type="hidden" name="dropoffLng" value={dropoff?.lng ?? ""} />

      <div>
        <label htmlFor="pickupLabel" className="label">
          {service === "beli" ? "Nama toko / warung" : "Ambil dari"}
        </label>
        <input id="pickupLabel" name="pickupLabel" required maxLength={120} className="input" placeholder="Warung Bu Imas, Jl. Raya Jatinangor" />
      </div>
      <div>
        <label htmlFor="dropoffLabel" className="label">
          Antar ke
        </label>
        <input id="dropoffLabel" name="dropoffLabel" required maxLength={120} className="input" placeholder="Kos Melati, kamar 12" />
      </div>
      <div>
        <label htmlFor="details" className="label">
          {service === "beli" ? "Mau beli apa?" : "Barang apa yang diantar?"}
        </label>
        <textarea id="details" name="details" required maxLength={500} rows={3} className="input" placeholder="Nasi ayam geprek 2, sambal dipisah" />
        <p className="mt-1 text-xs text-stone-500">Nomor HP, username, dan link akan disembunyikan dari driver.</p>
      </div>

      {service === "beli" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="itemBudget" className="label">
              Budget belanja maks.
            </label>
            <input
              id="itemBudget"
              name="itemBudget"
              type="number"
              inputMode="numeric"
              min={1000}
              max={500000}
              step={500}
              required
              className="input"
              onChange={(e) => setItemBudget(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label htmlFor="extraStores" className="label">
              Toko tambahan
            </label>
            <select
              id="extraStores"
              name="extraStores"
              className="input"
              value={extraStores}
              onChange={(e) => setExtraStores(Number(e.target.value))}
            >
              <option value={0}>Tidak ada</option>
              <option value={1}>1 toko (+Rp2.000)</option>
              <option value={2}>2 toko (+Rp4.000)</option>
            </select>
          </div>
        </div>
      )}

      <div className="card space-y-1 text-sm">
        <h2 className="font-semibold">Perkiraan tagihan</h2>
        {!estimate && <p className="text-stone-500">Pilih titik ambil dan antar di peta.</p>}
        {typeof estimate === "string" && <p className="text-red-700">{estimate}</p>}
        {estimate && typeof estimate === "object" && (
          <dl className="space-y-1">
            <Row label={`Ongkir (${(estimate.distanceMeters / 1000).toFixed(1)} km)`} value={estimate.deliveryFee} />
            <Row label="Biaya layanan" value={estimate.buyerServiceFee} />
            {estimate.itemBudget > 0 && <Row label="Budget belanja (sisa dikembalikan)" value={estimate.itemBudget} />}
            <Row label="Total" value={estimate.total} bold />
            <p className="pt-1 text-xs text-stone-500">Ditambah kode unik Rp1–999 untuk pencocokan pembayaran.</p>
          </dl>
        )}
      </div>

      <FormMessage state={state} />
      <SubmitButton pendingText="Membuat order…">Buat order & bayar</SubmitButton>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-stone-200 pt-1 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{formatRupiah(value)}</dd>
    </div>
  );
}
