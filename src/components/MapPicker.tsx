"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { LatLng } from "@/domain/geo";

/** Pusat awal peta: kawasan kampus Jatinangor. */
const JATINANGOR: LatLng = { lat: -6.9262, lng: 107.7727 };

type Point = "pickup" | "dropoff";

const COLORS: Record<Point, string> = { pickup: "#f59e0b", dropoff: "#0f766e" };
// Kelas, bukan atribut style: CSP menolak style inline di HTML hasil render server.
const DOT_CLASS: Record<Point, string> = { pickup: "bg-accent", dropoff: "bg-brand" };

export function MapPicker({
  pickup,
  dropoff,
  onChange,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  onChange: (point: Point, value: LatLng) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Partial<Record<Point, CircleMarker>>>({});
  const [active, setActive] = useState<Point>("pickup");
  // Dipanggil dari listener klik peta yang dipasang sekali; selalu membaca nilai terbaru.
  const handleMapClick = useEffectEvent((value: LatLng) => {
    onChange(active, value);
    if (active === "pickup") setActive("dropoff");
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !container.current || map.current) return;
      const m = L.map(container.current, { zoomControl: true }).setView(
        [JATINANGOR.lat, JATINANGOR.lng],
        15,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);
      m.on("click", (e) => handleMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current = {};
    };
  }, []);

  useEffect(() => {
    (async () => {
      const m = map.current;
      if (!m) return;
      const L = await import("leaflet");
      for (const [point, value] of [
        ["pickup", pickup],
        ["dropoff", dropoff],
      ] as const) {
        const existing = markers.current[point];
        if (!value) {
          existing?.remove();
          delete markers.current[point];
        } else if (existing) {
          existing.setLatLng([value.lat, value.lng]);
        } else {
          markers.current[point] = L.circleMarker([value.lat, value.lng], {
            radius: 10,
            color: COLORS[point],
            fillColor: COLORS[point],
            fillOpacity: 0.8,
          }).addTo(m);
        }
      }
    })();
  }, [pickup, dropoff]);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange("dropoff", value);
        map.current?.setView([value.lat, value.lng], 16);
      },
      () => window.alert("Lokasi tidak bisa diambil. Pilih titik di peta."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-sm">
        {(["pickup", "dropoff"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            className={`flex-1 rounded-xl border px-3 py-2 font-medium ${active === p ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}
          >
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${DOT_CLASS[p]}`} />
            {p === "pickup" ? "Titik ambil / toko" : "Titik antar"}
          </button>
        ))}
      </div>
      <div ref={container} className="h-72 w-full overflow-hidden rounded-2xl border border-stone-300" />
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>Ketuk peta untuk memilih {active === "pickup" ? "titik ambil" : "titik antar"}.</span>
        <button type="button" onClick={useMyLocation} className="font-medium text-brand">
          Pakai lokasiku untuk titik antar
        </button>
      </div>
    </div>
  );
}
