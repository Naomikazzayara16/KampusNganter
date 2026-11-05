import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { quote, type ServiceType } from "@/domain/pricing";
import { amountToPay, paymentDeadline } from "@/domain/payment";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const ROOT = join(import.meta.dirname, "..", "..");

export type Db = {
  pool: pg.Pool;
  /** Menjalankan fn sebagai pengguna login (role authenticated) dengan auth.uid() = uid. */
  asUser<T>(uid: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
  /** Menjalankan fn sebagai server (role service_role). */
  asService<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
  asAnon<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export async function createTestDb(): Promise<Db> {
  const name = `kn_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  const setup = await pool.connect();
  try {
    await setup.query(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
    const dir = join(ROOT, "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await setup.query(readFileSync(join(dir, file), "utf8"));
    }
  } finally {
    setup.release();
  }

  async function run<T>(prelude: string[], fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      for (const q of prelude) await c.query(q);
      const out = await fn(c);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  return {
    pool,
    asUser: (uid, fn) => {
      if (!/^[0-9a-f-]{36}$/.test(uid)) throw new Error("uid tidak valid");
      return run(
        ["set local role authenticated", `select set_config('request.jwt.claim.sub', '${uid}', true)`],
        fn,
      );
    },
    asService: (fn) => run(["set local role service_role"], fn),
    asAnon: (fn) => run(["set local role anon"], fn),
    close: async () => {
      await pool.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

let phoneSeq = 100000;

export async function createUser(db: Db, roles: Array<"admin"> = []): Promise<string> {
  phoneSeq += 1;
  const { rows } = await db.pool.query<{ id: string }>(
    "insert into auth.users (phone) values ($1) returning id",
    [`62812${String(phoneSeq).padStart(7, "0")}`],
  );
  const id = rows[0]!.id;
  for (const role of roles) {
    await db.pool.query("insert into public.user_roles (user_id, role) values ($1, $2)", [id, role]);
  }
  return id;
}

export async function createDriver(db: Db, opts: { online?: boolean } = {}): Promise<string> {
  const id = await createUser(db);
  await db.pool.query(
    `insert into public.drivers (user_id, nickname, campus, vehicle_type, plate_number)
     values ($1, 'Raka', 'Unpad', 'Motor', 'D 1234 ABC')`,
    [id],
  );
  await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'driver')", [id]);
  if (opts.online ?? true) {
    await db.pool.query(
      `insert into public.driver_availability (driver_id, zone_id, online_until)
       values ($1, 1, now() + interval '2 hours')`,
      [id],
    );
  }
  return id;
}

let codeSeq = 0;

export async function createOrder(
  db: Db,
  buyerId: string,
  opts: { service?: ServiceType; itemBudget?: number; distanceMeters?: number } = {},
): Promise<string> {
  const service = opts.service ?? "beli";
  const q = quote({
    service,
    distanceMeters: opts.distanceMeters ?? 1800,
    itemBudget: service === "beli" ? (opts.itemBudget ?? 50000) : 0,
  });
  codeSeq = (codeSeq % 999) + 1;
  return db.asService(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.orders (
         buyer_id, zone_id, service, pickup_label, pickup_lat, pickup_lng,
         dropoff_label, dropoff_lat, dropoff_lng, details, distance_m, extra_stores,
         base_fee, distance_fee, extra_store_fee, delivery_fee, buyer_service_fee,
         item_budget, total, unique_code, amount_due, payment_deadline)
       values ($1, 1, $2, 'Warung Bu Imas', -6.93, 107.77, 'Kos Melati', -6.925, 107.772,
               'Nasi ayam 2 bungkus', $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        buyerId,
        service,
        q.distanceMeters,
        q.baseFee,
        q.distanceFee,
        q.extraStoreFee,
        q.deliveryFee,
        q.buyerServiceFee,
        q.itemBudget,
        q.total,
        codeSeq,
        amountToPay(q.total, codeSeq),
        paymentDeadline(new Date()),
      ],
    );
    return rows[0]!.id;
  });
}

export async function orderRow(db: Db, id: string) {
  const { rows } = await db.pool.query("select * from public.orders where id = $1", [id]);
  return rows[0];
}

export async function addProof(db: Db, orderId: string, uploader: string, kind: string) {
  await db.asService((c) =>
    c.query(
      `insert into public.order_proofs (order_id, kind, storage_path, uploaded_by)
       values ($1, $2, $3, $4)`,
      [orderId, kind, `${orderId}/${kind}-${Math.random()}.jpg`, uploader],
    ),
  );
}
