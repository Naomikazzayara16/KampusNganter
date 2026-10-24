import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allTransitionPairs, ORDER_STATUSES } from "@/domain/order-status";
import { settleCompletedOrder } from "@/domain/settlement";
import {
  addProof,
  createDriver,
  createOrder,
  createTestDb,
  createUser,
  orderRow,
  type Db,
} from "./harness";

let db: Db;
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await createUser(db, ["admin"]);
});
afterAll(async () => {
  await db?.close();
});

async function paidOrder(buyer: string, opts?: Parameters<typeof createOrder>[2]) {
  const id = await createOrder(db, buyer, opts);
  const o = await orderRow(db, id);
  await db.asService((c) =>
    c.query("select public.confirm_payment($1, $2, $3, 'mutasi')", [id, admin, o.amount_due]),
  );
  return id;
}

describe("aturan status sama dengan kode aplikasi", () => {
  it("tabel order_transitions = daftar di src/domain/order-status.ts", async () => {
    const { rows } = await db.pool.query<{ from_status: string; to_status: string }>(
      "select distinct from_status::text, to_status::text from public.order_transitions",
    );
    const sql = rows.map((r) => `${r.from_status}>${r.to_status}`).sort();
    const ts = allTransitionPairs()
      .map(([a, b]) => `${a}>${b}`)
      .sort();
    expect(sql).toEqual(ts);
  });

  it("enum status di database sama dengan kode", async () => {
    const { rows } = await db.pool.query<{ v: string }>(
      "select unnest(enum_range(null::public.order_status))::text as v",
    );
    expect(rows.map((r) => r.v)).toEqual([...ORDER_STATUSES]);
  });
});

describe("profil dibuat otomatis", () => {
  it("akun baru mendapat profil dan peran buyer", async () => {
    const u = await createUser(db);
    const { rows } = await db.pool.query("select role from public.user_roles where user_id = $1", [u]);
    expect(rows.map((r) => r.role)).toEqual(["buyer"]);
  });
});

describe("browser tidak bisa menulis langsung", () => {
  it("authenticated tidak bisa insert/update order atau memberi diri peran admin", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    await expect(
      db.asUser(buyer, (c) => c.query("update public.orders set total = 1 where id = $1", [id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(buyer, (c) =>
        c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [buyer]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(buyer, (c) => c.query("select public.confirm_payment($1, $2, 1, null)", [id, buyer])),
    ).rejects.toThrow(/permission denied/);
  });

  it("anon tidak bisa membaca order", async () => {
    await expect(db.asAnon((c) => c.query("select * from public.orders"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("RLS: setiap orang hanya melihat datanya", () => {
  it("buyer tidak melihat order buyer lain", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const idA = await createOrder(db, a);
    const rows = await db.asUser(b, async (c) =>
      (await c.query("select id from public.orders where id = $1", [idA])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("nomor HP tidak bisa dibaca lewat API, bahkan oleh pemiliknya", async () => {
    const a = await createUser(db);
    await expect(
      db.asUser(a, (c) => c.query("select phone from public.profiles where id = $1", [a])),
    ).rejects.toThrow(/permission denied/);
    const rows = await db.asUser(a, async (c) =>
      (await c.query("select display_name from public.profiles")).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it("driver tidak melihat order yang belum dia ambil, kecuali lewat daftar terbuka tanpa data buyer", async () => {
    const buyer = await createUser(db);
    const driver = await createDriver(db);
    const id = await paidOrder(buyer);

    const direct = await db.asUser(driver, async (c) =>
      (await c.query("select id from public.orders where id = $1", [id])).rows,
    );
    expect(direct).toHaveLength(0);

    const open = await db.asUser(driver, async (c) =>
      (await c.query("select * from public.open_orders_for_driver()")).rows,
    );
    const offer = open.find((r) => r.id === id);
    expect(offer).toBeDefined();
    expect(Object.keys(offer)).not.toContain("buyer_id");
    expect(Object.keys(offer)).not.toContain("dropoff_label");
  });

  it("driver offline tidak mendapat daftar order", async () => {
    const buyer = await createUser(db);
    const offline = await createDriver(db, { online: false });
    await paidOrder(buyer);
    const open = await db.asUser(offline, async (c) =>
      (await c.query("select * from public.open_orders_for_driver()")).rows,
    );
    expect(open).toHaveLength(0);
  });

  it("buyer bisa melihat driver ordernya, tapi tidak data pendaftarannya", async () => {
    const buyer = await createUser(db);
    const driver = await createDriver(db);
    const other = await createUser(db);
    const id = await paidOrder(buyer);
    await db.asService((c) => c.query("select public.claim_order($1, $2)", [id, driver]));

    const seen = await db.asUser(buyer, async (c) =>
      (await c.query("select nickname, plate_number from public.drivers where user_id = $1", [driver])).rows,
    );
    expect(seen).toEqual([{ nickname: "Raka", plate_number: "D 1234 ABC" }]);
    const stranger = await db.asUser(other, async (c) =>
      (await c.query("select 1 from public.drivers where user_id = $1", [driver])).rows,
    );
    expect(stranger).toHaveLength(0);
  });
});

describe("integritas pembayaran", () => {
  it("nominal harus sama persis dengan tagihan + kode unik", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    const o = await orderRow(db, id);
    await expect(
      db.asService((c) =>
        c.query("select public.confirm_payment($1, $2, $3, null)", [id, admin, o.amount_due - 1]),
      ),
    ).rejects.toThrow(/amount_mismatch/);
  });

  it("hanya admin yang bisa mengonfirmasi", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    const o = await orderRow(db, id);
    await expect(
      db.asService((c) =>
        c.query("select public.confirm_payment($1, $2, $3, null)", [id, buyer, o.amount_due]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("angka tagihan tidak bisa diubah setelah order dibuat, bahkan oleh server", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    await expect(
      db.asService((c) => c.query("update public.orders set delivery_fee = 1 where id = $1", [id])),
    ).rejects.toThrow(/order_immutable_fields|orders_delivery_fee_sum/);
  });

  it("constraint menolak tagihan yang tidak seimbang", async () => {
    const buyer = await createUser(db);
    await expect(
      db.asService((c) =>
        c.query(
          `insert into public.orders (buyer_id, zone_id, service, pickup_label, pickup_lat, pickup_lng,
             dropoff_label, dropoff_lat, dropoff_lng, details, distance_m, base_fee, distance_fee,
             extra_store_fee, delivery_fee, buyer_service_fee, item_budget, total, unique_code,
             amount_due, payment_deadline)
           values ($1, 1, 'antar_ambil', 'Asal', 0, 0, 'Tujuan', 0, 0, 'Dokumen', 100,
             5000, 0, 0, 5000, 1000, 0, 100, 5, 105, now())`,
          [buyer],
        ),
      ),
    ).rejects.toThrow(/orders_total_sum/);
  });

  it("log hanya bisa ditambah", async () => {
    const buyer = await createUser(db);
    const id = await paidOrder(buyer);
    await expect(
      db.asService((c) => c.query("delete from public.payments where order_id = $1", [id])),
    ).rejects.toThrow(/append_only/);
    await expect(
      db.asService((c) => c.query("update public.order_events set actor_id = null where order_id = $1", [id])),
    ).rejects.toThrow(/append_only/);
  });
});

describe("alur order", () => {
  it("dua driver berebut satu order: hanya satu yang dapat", async () => {
    const buyer = await createUser(db);
    const d1 = await createDriver(db);
    const d2 = await createDriver(db);
    const id = await paidOrder(buyer);
    const results = await Promise.allSettled([
      db.asService((c) => c.query("select public.claim_order($1, $2)", [id, d1])),
      db.asService((c) => c.query("select public.claim_order($1, $2)", [id, d2])),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const o = await orderRow(db, id);
    expect([d1, d2]).toContain(o.driver_id);
  });

  it("driver tidak bisa memegang lebih dari 2 order", async () => {
    const buyer = await createUser(db);
    const driver = await createDriver(db);
    for (let i = 0; i < 2; i++) {
      const id = await paidOrder(buyer);
      await db.asService((c) => c.query("select public.claim_order($1, $2)", [id, driver]));
    }
    const third = await paidOrder(buyer);
    await expect(
      db.asService((c) => c.query("select public.claim_order($1, $2)", [third, driver])),
    ).rejects.toThrow(/driver_busy/);
  });

  it("driver lain tidak bisa mengubah status order yang bukan miliknya", async () => {
    const buyer = await createUser(db);
    const owner = await createDriver(db);
    const intruder = await createDriver(db);
    const id = await paidOrder(buyer);
    await db.asService((c) => c.query("select public.claim_order($1, $2)", [id, owner]));
    await expect(
      db.asService((c) =>
        c.query("select public.advance_order($1, $2, 'driver', 'driver_assigned', 'at_pickup')", [
          id,
          intruder,
        ]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("status tidak bisa dilompati, bahkan lewat update langsung oleh server", async () => {
    const buyer = await createUser(db);
    const id = await paidOrder(buyer);
    await expect(
      db.asService((c) => c.query("update public.orders set status = 'completed' where id = $1", [id])),
    ).rejects.toThrow(/invalid_transition/);
  });

  it("alur titip beli lengkap sampai saldo driver tercatat", async () => {
    const buyer = await createUser(db);
    const driver = await createDriver(db);
    const id = await paidOrder(buyer, { itemBudget: 50000 });
    const svc = <T>(sql: string, params: unknown[]) =>
      db.asService((c) => c.query(sql, params)) as Promise<T>;

    await svc("select public.claim_order($1, $2)", [id, driver]);
    await svc("select public.advance_order($1, $2, 'driver', 'driver_assigned', 'at_pickup')", [id, driver]);

    await expect(
      svc("select public.advance_order($1, $2, 'driver', 'at_pickup', 'purchased', 30000, 0)", [id, driver]),
    ).rejects.toThrow(/receipt_required/);
    await addProof(db, id, driver, "receipt");
    await expect(
      svc("select public.advance_order($1, $2, 'driver', 'at_pickup', 'purchased', 60000, 0)", [id, driver]),
    ).rejects.toThrow(/orders_item_total_within_budget/);
    await svc("select public.advance_order($1, $2, 'driver', 'at_pickup', 'purchased', 30000, 1500)", [
      id,
      driver,
    ]);
    await svc("select public.advance_order($1, $2, 'driver', 'purchased', 'on_the_way')", [id, driver]);
    await addProof(db, id, driver, "handover");
    await svc("select public.advance_order($1, $2, 'driver', 'on_the_way', 'arrived')", [id, driver]);

    const o = await orderRow(db, id);
    const s = settleCompletedOrder({
      deliveryFee: o.delivery_fee,
      buyerServiceFee: o.buyer_service_fee,
      itemBudget: o.item_budget,
      itemTotal: o.item_total,
      waitFee: o.wait_fee,
    });

    await expect(
      svc("select public.complete_order($1, $2, 'buyer', $3, $4, $5)", [
        id,
        buyer,
        s.driverEarning + 1000,
        s.buyerRefund,
        s.platformFee,
      ]),
    ).rejects.toThrow(/unbalanced_settlement/);

    await svc("select public.complete_order($1, $2, 'buyer', $3, $4, $5)", [
      id,
      buyer,
      s.driverEarning,
      s.buyerRefund,
      s.platformFee,
    ]);

    const { rows } = await db.pool.query(
      "select amount from public.driver_ledger where order_id = $1 and kind = 'order_earning'",
      [id],
    );
    expect(rows).toEqual([{ amount: 8000 + 30000 + 1500 - 1000 }]);

    const events = await db.asUser(buyer, async (c) =>
      (await c.query("select to_status from public.order_events where order_id = $1 order by id", [id])).rows,
    );
    expect(events.map((e) => e.to_status)).toEqual([
      "awaiting_payment",
      "searching_driver",
      "driver_assigned",
      "at_pickup",
      "purchased",
      "on_the_way",
      "arrived",
      "completed",
    ]);
  });

  it("order belum dibayar yang dibatalkan tidak boleh memindahkan uang", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    await expect(
      db.asService((c) =>
        c.query("select public.cancel_order($1, $2, 'buyer', 'before_driver', 0, 100, 0)", [id, buyer]),
      ),
    ).rejects.toThrow(/unpaid_order_has_no_money/);
    await db.asService((c) =>
      c.query("select public.cancel_order($1, $2, 'buyer', 'before_driver', 0, 0, 0)", [id, buyer]),
    );
    expect((await orderRow(db, id)).status).toBe("cancelled");
  });

  it("order yang lewat batas bayar menjadi kedaluwarsa", async () => {
    const buyer = await createUser(db);
    const id = await createOrder(db, buyer);
    // Memundurkan batas waktu langsung di tabel (trigger penjaga dimatikan sebentar khusus tes).
    await db.pool.query("alter table public.orders disable trigger orders_guard");
    await db.pool.query(
      "update public.orders set payment_deadline = now() - interval '1 minute' where id = $1",
      [id],
    );
    await db.pool.query("alter table public.orders enable trigger orders_guard");
    await db.asService((c) => c.query("select public.expire_stale_orders()"));
    expect((await orderRow(db, id)).status).toBe("expired");
  });
});

describe("batas OTP", () => {
  it("maksimal 3 permintaan per nomor per 15 menit", async () => {
    const check = () =>
      db.asService(async (c) =>
        (await c.query<{ ok: boolean }>("select public.otp_rate_check('p1', 'ip1') as ok")).rows[0]!.ok,
      );
    expect(await check()).toBe(true);
    expect(await check()).toBe(true);
    expect(await check()).toBe(true);
    expect(await check()).toBe(false);
  });
});
