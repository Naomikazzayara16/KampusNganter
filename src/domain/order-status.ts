import type { ServiceType } from "./pricing";

export const ORDER_STATUSES = [
  "awaiting_payment",
  "searching_driver",
  "driver_assigned",
  "at_pickup",
  "purchased",
  "on_the_way",
  "arrived",
  "completed",
  "cancelled",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Actor = "buyer" | "driver" | "admin" | "system";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Menunggu pembayaran",
  searching_driver: "Mencari driver",
  driver_assigned: "Driver ditemukan",
  at_pickup: "Di toko / titik ambil",
  purchased: "Sudah dibeli",
  on_the_way: "Dalam perjalanan",
  arrived: "Sampai",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "completed",
  "cancelled",
  "expired",
]);

type Transition = { to: OrderStatus; by: readonly Actor[]; services?: readonly ServiceType[] };

/**
 * Satu-satunya daftar perpindahan status yang sah.
 * Database punya trigger dengan daftar yang sama sebagai lapisan kedua.
 */
const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  awaiting_payment: [
    { to: "searching_driver", by: ["admin"] },
    { to: "cancelled", by: ["buyer", "admin"] },
    { to: "expired", by: ["system"] },
  ],
  searching_driver: [
    { to: "driver_assigned", by: ["driver"] },
    { to: "cancelled", by: ["buyer", "admin"] },
  ],
  driver_assigned: [
    { to: "at_pickup", by: ["driver"] },
    // Driver melepas order sebelum sampai: order ditawarkan lagi.
    { to: "searching_driver", by: ["driver", "admin"] },
    { to: "cancelled", by: ["admin"] },
  ],
  at_pickup: [
    { to: "purchased", by: ["driver"], services: ["beli"] },
    { to: "on_the_way", by: ["driver"], services: ["antar_ambil"] },
    { to: "cancelled", by: ["admin"] },
  ],
  purchased: [
    { to: "on_the_way", by: ["driver"] },
    { to: "cancelled", by: ["admin"] },
  ],
  on_the_way: [
    { to: "arrived", by: ["driver"] },
    { to: "cancelled", by: ["admin"] },
  ],
  arrived: [
    { to: "completed", by: ["buyer", "admin", "system"] },
    { to: "cancelled", by: ["admin"] },
  ],
  completed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: Actor,
  service: ServiceType,
): boolean {
  return TRANSITIONS[from].some(
    (t) => t.to === to && t.by.includes(actor) && (!t.services || t.services.includes(service)),
  );
}

/** Langkah berikut untuk driver pada order yang sedang dia pegang. */
export function nextDriverStep(status: OrderStatus, service: ServiceType): OrderStatus | null {
  const t = TRANSITIONS[status].find(
    (x) =>
      x.by.includes("driver") &&
      x.to !== "searching_driver" &&
      (!x.services || x.services.includes(service)),
  );
  return t?.to ?? null;
}

/** Semua pasangan (from, to) yang sah, untuk mencocokkan dengan trigger database. */
export function allTransitionPairs(): Array<[OrderStatus, OrderStatus]> {
  const pairs = new Set<string>();
  for (const from of ORDER_STATUSES) {
    for (const t of TRANSITIONS[from]) pairs.add(`${from}>${t.to}`);
  }
  return [...pairs].map((p) => p.split(">") as [OrderStatus, OrderStatus]);
}
