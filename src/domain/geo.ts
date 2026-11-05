export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

/** Jalan tidak lurus; rancangan memakai garis lurus × 1,3 sebagai perkiraan jarak tempuh. */
export const ROAD_FACTOR = 1.3;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

export function straightLineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Perkiraan jarak tempuh dalam meter (bilangan bulat). */
export function estimatedRoadMeters(a: LatLng, b: LatLng): number {
  return Math.round(straightLineKm(a, b) * ROAD_FACTOR * 1000);
}
