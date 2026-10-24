-- KampusNganter: skema awal.
--
-- Aturan dasar keamanan:
--   * Baca data: lewat Row Level Security (RLS). Setiap orang hanya melihat datanya sendiri.
--   * Ubah data: hanya lewat fungsi di bawah yang dijalankan server (role service_role).
--     Browser tidak pernah bisa menulis langsung ke tabel.
--   * Uang dan status order dijaga constraint + trigger, jadi bug di kode aplikasi
--     tidak bisa membuat angka yang tidak seimbang atau status yang melompat.
--   * Log (order_events, payments, driver_ledger, audit_log) hanya bisa ditambah.

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('buyer', 'driver', 'admin');
create type public.service_type as enum ('antar_ambil', 'beli');
create type public.order_status as enum (
  'awaiting_payment',
  'searching_driver',
  'driver_assigned',
  'at_pickup',
  'purchased',
  'on_the_way',
  'arrived',
  'completed',
  'cancelled',
  'expired'
);
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.document_kind as enum ('ktm', 'ktp', 'sim', 'stnk');
create type public.proof_kind as enum ('receipt', 'handover', 'store_closed');
create type public.cancel_reason as enum (
  'before_driver',
  'buyer_soon_after_claim',
  'buyer_driver_en_route',
  'store_closed',
  'driver_fault'
);

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table public.zones (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Pengguna' check (char_length(display_name) between 2 and 40),
  phone text not null unique check (phone ~ '^\+628[0-9]{8,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.driver_applications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 80),
  nim text not null check (nim ~ '^[A-Za-z0-9.\-]{5,20}$'),
  campus text not null check (char_length(campus) between 2 and 80),
  vehicle_type text not null check (char_length(vehicle_type) between 2 and 40),
  plate_number text not null check (plate_number ~ '^[A-Z]{1,2} ?[0-9]{1,4} ?[A-Z]{0,3}$'),
  bank_name text not null check (char_length(bank_name) between 2 and 30),
  bank_account_number text not null check (bank_account_number ~ '^[0-9]{6,20}$'),
  bank_account_name text not null check (char_length(bank_account_name) between 3 and 80),
  consent_at timestamptz not null,
  status public.application_status not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.driver_applications (user_id) on delete cascade,
  kind public.document_kind not null,
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  uploaded_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- Data driver yang boleh dilihat buyer. Tanpa nomor HP, NIM, atau rekening.
create table public.drivers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 30),
  campus text not null,
  vehicle_type text not null,
  plate_number text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.driver_availability (
  driver_id uuid primary key references public.drivers (user_id) on delete cascade,
  zone_id smallint not null references public.zones (id),
  online_until timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default ('KN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  buyer_id uuid not null references auth.users (id),
  driver_id uuid references public.drivers (user_id),
  zone_id smallint not null references public.zones (id),
  service public.service_type not null,
  status public.order_status not null default 'awaiting_payment',

  pickup_label text not null check (char_length(pickup_label) between 3 and 120),
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  dropoff_label text not null check (char_length(dropoff_label) between 3 and 120),
  dropoff_lat double precision not null check (dropoff_lat between -90 and 90),
  dropoff_lng double precision not null check (dropoff_lng between -180 and 180),
  details text not null check (char_length(details) between 3 and 500),

  distance_m integer not null check (distance_m between 0 and 15000),
  extra_stores smallint not null default 0 check (extra_stores between 0 and 2),
  base_fee integer not null check (base_fee >= 0),
  distance_fee integer not null check (distance_fee >= 0),
  extra_store_fee integer not null check (extra_store_fee >= 0),
  delivery_fee integer not null,
  buyer_service_fee integer not null check (buyer_service_fee >= 0),
  item_budget integer not null default 0 check (item_budget between 0 and 500000),
  total integer not null,
  unique_code smallint not null check (unique_code between 1 and 999),
  amount_due integer not null,
  payment_deadline timestamptz not null,

  item_total integer check (item_total >= 0),
  wait_fee integer not null default 0 check (wait_fee >= 0),

  driver_earning integer check (driver_earning >= 0),
  buyer_refund integer check (buyer_refund >= 0),
  platform_fee integer check (platform_fee >= 0),
  cancel_reason public.cancel_reason,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  claimed_at timestamptz,
  at_pickup_at timestamptz,
  purchased_at timestamptz,
  on_the_way_at timestamptz,
  arrived_at timestamptz,
  closed_at timestamptz,

  constraint orders_delivery_fee_sum check (delivery_fee = base_fee + distance_fee + extra_store_fee),
  constraint orders_total_sum check (total = delivery_fee + buyer_service_fee + item_budget),
  constraint orders_amount_due_sum check (amount_due = total + unique_code),
  constraint orders_item_total_within_budget check (item_total is null or item_total <= item_budget),
  constraint orders_wait_fee_within_budget
    check (wait_fee <= item_budget - coalesce(item_total, 0)),
  constraint orders_service_shape check (
    (service = 'antar_ambil' and item_budget = 0 and extra_stores = 0)
    or (service = 'beli' and item_budget > 0)
  ),
  constraint orders_driver_when_assigned check (
    status in ('awaiting_payment', 'searching_driver', 'cancelled', 'expired')
    or driver_id is not null
  ),
  constraint orders_settlement_balanced check (
    driver_earning is null
    or driver_earning + buyer_refund + platform_fee in (0, total)
  )
);

-- Kode unik hanya perlu unik di antara order yang belum dibayar.
create unique index orders_unique_code_awaiting
  on public.orders (unique_code) where status = 'awaiting_payment';
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_driver_idx on public.orders (driver_id, status);
create index orders_open_idx on public.orders (zone_id, created_at) where status = 'searching_driver';

-- Daftar perpindahan status yang sah. Harus sama persis dengan src/domain/order-status.ts
-- (dicek oleh tes).
create table public.order_transitions (
  from_status public.order_status not null,
  to_status public.order_status not null,
  actor_role text not null check (actor_role in ('buyer', 'driver', 'admin', 'system')),
  service public.service_type,
  unique nulls not distinct (from_status, to_status, actor_role, service)
);

insert into public.order_transitions (from_status, to_status, actor_role, service) values
  ('awaiting_payment', 'searching_driver', 'admin', null),
  ('awaiting_payment', 'cancelled', 'buyer', null),
  ('awaiting_payment', 'cancelled', 'admin', null),
  ('awaiting_payment', 'expired', 'system', null),
  ('searching_driver', 'driver_assigned', 'driver', null),
  ('searching_driver', 'cancelled', 'buyer', null),
  ('searching_driver', 'cancelled', 'admin', null),
  ('driver_assigned', 'at_pickup', 'driver', null),
  ('driver_assigned', 'searching_driver', 'driver', null),
  ('driver_assigned', 'searching_driver', 'admin', null),
  ('driver_assigned', 'cancelled', 'admin', null),
  ('at_pickup', 'purchased', 'driver', 'beli'),
  ('at_pickup', 'on_the_way', 'driver', 'antar_ambil'),
  ('at_pickup', 'cancelled', 'admin', null),
  ('purchased', 'on_the_way', 'driver', null),
  ('purchased', 'cancelled', 'admin', null),
  ('on_the_way', 'arrived', 'driver', null),
  ('on_the_way', 'cancelled', 'admin', null),
  ('arrived', 'completed', 'buyer', null),
  ('arrived', 'completed', 'admin', null),
  ('arrived', 'completed', 'system', null),
  ('arrived', 'cancelled', 'admin', null);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id),
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  actor_role text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, id);

create table public.order_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  kind public.proof_kind not null,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index order_proofs_order_idx on public.order_proofs (order_id);

create table public.payments (
  order_id uuid primary key references public.orders (id),
  amount integer not null check (amount > 0),
  reference text check (char_length(reference) <= 80),
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now()
);

create table public.driver_ledger (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (user_id),
  order_id uuid references public.orders (id),
  kind text not null check (kind in ('order_earning', 'payout', 'adjustment')),
  amount integer not null,
  note text check (char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index driver_ledger_one_earning_per_order
  on public.driver_ledger (order_id) where kind = 'order_earning';

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) between 3 and 60),
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Batas permintaan OTP. Hanya hash (HMAC) nomor dan IP yang disimpan.
create table public.otp_requests (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index otp_requests_phone_idx on public.otp_requests (phone_hash, created_at);
create index otp_requests_ip_idx on public.otp_requests (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- Hak akses dasar: cabut semua, lalu buka yang perlu saja
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.zones to anon, authenticated;
-- Nomor HP tidak ikut di-grant: pemilik membacanya dari sesi login, orang lain tidak pernah.
grant select (id, display_name, created_at, updated_at) on public.profiles to authenticated;
grant select on
  public.user_roles,
  public.driver_applications,
  public.driver_documents,
  public.drivers,
  public.driver_availability,
  public.orders,
  public.order_events,
  public.order_proofs,
  public.payments,
  public.driver_ledger,
  public.audit_log
to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------

create function public.has_role(p_user uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles where user_id = p_user and role = p_role
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger driver_applications_touch before update on public.driver_applications
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only: % tidak boleh diubah atau dihapus', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger order_events_append_only before update or delete on public.order_events
  for each row execute function public.forbid_change();
create trigger payments_append_only before update or delete on public.payments
  for each row execute function public.forbid_change();
create trigger driver_ledger_append_only before update or delete on public.driver_ledger
  for each row execute function public.forbid_change();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_change();
create trigger order_transitions_locked before update or delete on public.order_transitions
  for each row execute function public.forbid_change();

-- Profil dan peran buyer dibuat otomatis saat akun baru dibuat lewat OTP.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null then
    return new;
  end if;
  insert into public.profiles (id, phone)
  values (new.id, '+' || ltrim(new.phone, '+'))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'buyer')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Penjaga status order (lapisan kedua setelah kode aplikasi)
-- ---------------------------------------------------------------------------

create function public.guard_order_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Angka tagihan dan pemilik order tidak boleh berubah setelah dibuat.
    if (new.buyer_id, new.zone_id, new.service, new.distance_m, new.extra_stores, new.base_fee,
        new.distance_fee, new.extra_store_fee, new.delivery_fee, new.buyer_service_fee,
        new.item_budget, new.total, new.unique_code, new.amount_due, new.code)
       is distinct from
       (old.buyer_id, old.zone_id, old.service, old.distance_m, old.extra_stores, old.base_fee,
        old.distance_fee, old.extra_store_fee, old.delivery_fee, old.buyer_service_fee,
        old.item_budget, old.total, old.unique_code, old.amount_due, old.code) then
      raise exception 'order_immutable_fields' using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      if not exists (
        select 1 from public.order_transitions t
        where t.from_status = old.status
          and t.to_status = new.status
          and (t.service is null or t.service = new.service)
      ) then
        raise exception 'invalid_transition: % -> %', old.status, new.status
          using errcode = '42501';
      end if;
    elsif old.status in ('completed', 'cancelled', 'expired') then
      raise exception 'order_closed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_guard before update on public.orders
  for each row execute function public.guard_order_change();

create function public.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role)
    values (new.id, null, new.status, new.buyer_id, 'buyer');
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role)
    values (
      new.id,
      old.status,
      new.status,
      nullif(current_setting('app.actor_id', true), '')::uuid,
      nullif(current_setting('app.actor_role', true), '')
    );
  end if;
  return null;
end;
$$;

create trigger orders_log after insert or update on public.orders
  for each row execute function public.log_order_event();

-- Fungsi internal: memastikan aktor boleh melakukan perpindahan ini, lalu mencatatnya.
create function public._authorize_transition(
  p_order public.orders,
  p_actor uuid,
  p_role text,
  p_to public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'admin' and not public.has_role(p_actor, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  elsif p_role = 'driver' and p_to <> 'driver_assigned'
        and p_order.driver_id is distinct from p_actor then
    raise exception 'forbidden' using errcode = '42501';
  elsif p_role = 'buyer' and p_order.buyer_id <> p_actor then
    raise exception 'forbidden' using errcode = '42501';
  elsif p_role not in ('admin', 'driver', 'buyer', 'system') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.order_transitions t
    where t.from_status = p_order.status
      and t.to_status = p_to
      and t.actor_role = p_role
      and (t.service is null or t.service = p_order.service)
  ) then
    raise exception 'invalid_transition' using errcode = '42501';
  end if;

  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  perform set_config('app.actor_role', p_role, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fungsi yang dipanggil server (hanya service_role)
-- ---------------------------------------------------------------------------

create function public.confirm_payment(
  p_order_id uuid,
  p_admin uuid,
  p_amount integer,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_amount <> v_order.amount_due then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;
  perform public._authorize_transition(v_order, p_admin, 'admin', 'searching_driver');

  insert into public.payments (order_id, amount, reference, confirmed_by)
  values (p_order_id, p_amount, p_reference, p_admin);

  update public.orders
     set status = 'searching_driver', paid_at = now()
   where id = p_order_id;
end;
$$;

create function public.claim_order(p_order_id uuid, p_driver uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_zone smallint;
  v_active integer;
begin
  -- Kunci baris driver agar dua klaim bersamaan dari driver yang sama diproses bergantian.
  perform 1 from public.drivers where user_id = p_driver and active for update;
  if not found then
    raise exception 'driver_not_active' using errcode = '42501';
  end if;

  select a.zone_id into v_zone
    from public.driver_availability a
   where a.driver_id = p_driver
     and a.online_until > now()
     and a.last_seen_at > now() - interval '30 minutes';
  if not found then
    raise exception 'driver_offline' using errcode = '42501';
  end if;

  select count(*) into v_active
    from public.orders
   where driver_id = p_driver
     and status in ('driver_assigned', 'at_pickup', 'purchased', 'on_the_way', 'arrived');
  if v_active >= 2 then
    raise exception 'driver_busy' using errcode = '42501';
  end if;

  -- Kunci order: hanya satu driver yang bisa lolos dari titik ini.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'searching_driver' then
    raise exception 'order_taken' using errcode = '40001';
  end if;
  if v_order.zone_id <> v_zone then
    raise exception 'wrong_zone' using errcode = '42501';
  end if;
  if v_order.buyer_id = p_driver then
    raise exception 'own_order' using errcode = '42501';
  end if;

  perform public._authorize_transition(v_order, p_driver, 'driver', 'driver_assigned');
  update public.orders
     set status = 'driver_assigned', driver_id = p_driver, claimed_at = now()
   where id = p_order_id;
end;
$$;

-- Perpindahan status tanpa uang: sampai, sudah dibeli, jalan, sampai tujuan, lepas order.
create function public.advance_order(
  p_order_id uuid,
  p_actor uuid,
  p_role text,
  p_from public.order_status,
  p_to public.order_status,
  p_item_total integer default null,
  p_wait_fee integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_to in ('completed', 'cancelled', 'expired', 'driver_assigned') then
    raise exception 'use_dedicated_function' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> p_from then
    raise exception 'stale_status' using errcode = '40001';
  end if;
  perform public._authorize_transition(v_order, p_actor, p_role, p_to);

  if p_to = 'purchased' then
    if p_item_total is null or p_wait_fee is null then
      raise exception 'item_total_required' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.order_proofs where order_id = p_order_id and kind = 'receipt'
    ) then
      raise exception 'receipt_required' using errcode = '22023';
    end if;
    update public.orders
       set status = 'purchased', item_total = p_item_total, wait_fee = p_wait_fee,
           purchased_at = now()
     where id = p_order_id;
  elsif p_to = 'at_pickup' then
    update public.orders set status = 'at_pickup', at_pickup_at = now() where id = p_order_id;
  elsif p_to = 'on_the_way' then
    update public.orders
       set status = 'on_the_way', on_the_way_at = now(),
           item_total = case when service = 'antar_ambil' then 0 else item_total end
     where id = p_order_id;
  elsif p_to = 'arrived' then
    if not exists (
      select 1 from public.order_proofs where order_id = p_order_id and kind = 'handover'
    ) then
      raise exception 'handover_required' using errcode = '22023';
    end if;
    update public.orders set status = 'arrived', arrived_at = now() where id = p_order_id;
  elsif p_to = 'searching_driver' then
    update public.orders
       set status = 'searching_driver', driver_id = null, claimed_at = null
     where id = p_order_id;
  else
    raise exception 'invalid_transition' using errcode = '42501';
  end if;
end;
$$;

create function public.complete_order(
  p_order_id uuid,
  p_actor uuid,
  p_role text,
  p_driver_earning integer,
  p_buyer_refund integer,
  p_platform_fee integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  perform public._authorize_transition(v_order, p_actor, p_role, 'completed');

  if p_driver_earning + p_buyer_refund + p_platform_fee <> v_order.total then
    raise exception 'unbalanced_settlement' using errcode = '22023';
  end if;
  if p_buyer_refund <> v_order.item_budget - coalesce(v_order.item_total, 0) - v_order.wait_fee then
    raise exception 'refund_mismatch' using errcode = '22023';
  end if;

  update public.orders
     set status = 'completed', closed_at = now(),
         driver_earning = p_driver_earning, buyer_refund = p_buyer_refund,
         platform_fee = p_platform_fee
   where id = p_order_id;

  insert into public.driver_ledger (driver_id, order_id, kind, amount, created_by)
  values (v_order.driver_id, p_order_id, 'order_earning', p_driver_earning, p_actor);
end;
$$;

create function public.cancel_order(
  p_order_id uuid,
  p_actor uuid,
  p_role text,
  p_reason public.cancel_reason,
  p_driver_earning integer,
  p_buyer_refund integer,
  p_platform_fee integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_paid boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  perform public._authorize_transition(v_order, p_actor, p_role, 'cancelled');

  v_paid := v_order.status <> 'awaiting_payment';
  if not v_paid and (p_driver_earning, p_buyer_refund, p_platform_fee) <> (0, 0, 0) then
    raise exception 'unpaid_order_has_no_money' using errcode = '22023';
  end if;
  if v_paid and p_driver_earning + p_buyer_refund + p_platform_fee <> v_order.total then
    raise exception 'unbalanced_settlement' using errcode = '22023';
  end if;
  if p_driver_earning > 0 and v_order.driver_id is null then
    raise exception 'no_driver_to_pay' using errcode = '22023';
  end if;

  update public.orders
     set status = 'cancelled', closed_at = now(), cancel_reason = p_reason,
         driver_earning = p_driver_earning, buyer_refund = p_buyer_refund,
         platform_fee = p_platform_fee
   where id = p_order_id;

  if p_driver_earning > 0 then
    insert into public.driver_ledger (driver_id, order_id, kind, amount, created_by)
    values (v_order.driver_id, p_order_id, 'order_earning', p_driver_earning, p_actor);
  end if;
end;
$$;

create function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('app.actor_id', '', true);
  perform set_config('app.actor_role', 'system', true);
  update public.orders
     set status = 'expired', closed_at = now()
   where status = 'awaiting_payment' and payment_deadline < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.approve_driver(p_user uuid, p_admin uuid, p_nickname text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.driver_applications;
begin
  if not public.has_role(p_admin, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_app from public.driver_applications where user_id = p_user for update;
  if not found or v_app.status <> 'pending' then
    raise exception 'application_not_pending' using errcode = '22023';
  end if;
  if (select count(*) from public.driver_documents where user_id = p_user) < 4 then
    raise exception 'documents_incomplete' using errcode = '22023';
  end if;

  update public.driver_applications
     set status = 'approved', reviewed_by = p_admin, reviewed_at = now()
   where user_id = p_user;
  insert into public.drivers (user_id, nickname, campus, vehicle_type, plate_number)
  values (p_user, p_nickname, v_app.campus, v_app.vehicle_type, v_app.plate_number)
  on conflict (user_id) do update set active = true;
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user, 'driver', p_admin)
  on conflict do nothing;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (p_admin, 'driver.approve', 'user', p_user::text);
end;
$$;

-- Batas OTP: 3 per nomor per 15 menit, 10 per IP per jam.
create function public.otp_rate_check(p_phone_hash text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.otp_requests where created_at < now() - interval '1 day';
  if (select count(*) from public.otp_requests
       where phone_hash = p_phone_hash and created_at > now() - interval '15 minutes') >= 3
     or (select count(*) from public.otp_requests
          where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into public.otp_requests (phone_hash, ip_hash) values (p_phone_hash, p_ip_hash);
  return true;
end;
$$;

-- Order terbuka untuk driver: hanya kolom yang aman (tanpa data buyer, tanpa alamat detail).
create function public.open_orders_for_driver()
returns table (
  id uuid,
  code text,
  service public.service_type,
  zone_id smallint,
  distance_m integer,
  delivery_fee integer,
  item_budget integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.code, o.service, o.zone_id, o.distance_m, o.delivery_fee, o.item_budget, o.created_at
    from public.orders o
    join public.driver_availability a on a.zone_id = o.zone_id
    join public.drivers d on d.user_id = a.driver_id and d.active
   where a.driver_id = auth.uid()
     and a.online_until > now()
     and o.status = 'searching_driver'
     and o.buyer_id <> auth.uid()
   order by o.created_at
   limit 50;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.open_orders_for_driver() to authenticated;
grant execute on function
  public.confirm_payment(uuid, uuid, integer, text),
  public.claim_order(uuid, uuid),
  public.advance_order(uuid, uuid, text, public.order_status, public.order_status, integer, integer),
  public.complete_order(uuid, uuid, text, integer, integer, integer),
  public.cancel_order(uuid, uuid, text, public.cancel_reason, integer, integer, integer),
  public.expire_stale_orders(),
  public.approve_driver(uuid, uuid, text),
  public.otp_rate_check(text, text),
  public.has_role(uuid, public.app_role)
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security: siapa boleh membaca apa
-- ---------------------------------------------------------------------------

alter table public.zones enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.driver_applications enable row level security;
alter table public.driver_documents enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_availability enable row level security;
alter table public.orders enable row level security;
alter table public.order_transitions enable row level security;
alter table public.order_events enable row level security;
alter table public.order_proofs enable row level security;
alter table public.payments enable row level security;
alter table public.driver_ledger enable row level security;
alter table public.audit_log enable row level security;
alter table public.otp_requests enable row level security;

create policy zones_read on public.zones for select to anon, authenticated using (active);

-- Driver melihat nama buyer selama ordernya berjalan (kolom phone tetap tertutup oleh grant).
create policy profiles_visible on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.orders o
       where o.buyer_id = profiles.id
         and o.driver_id = auth.uid()
         and o.status not in ('completed', 'cancelled', 'expired')
    )
  );

create policy user_roles_own on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy driver_applications_own on public.driver_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy driver_documents_own on public.driver_documents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Buyer hanya melihat driver yang sedang memegang ordernya.
create policy drivers_visible on public.drivers for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.orders o
       where o.driver_id = drivers.user_id
         and o.buyer_id = auth.uid()
         and o.status not in ('completed', 'cancelled', 'expired')
    )
  );

create policy driver_availability_own on public.driver_availability for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());

create policy orders_participants on public.orders for select to authenticated
  using (buyer_id = auth.uid() or driver_id = auth.uid() or public.is_admin());

create policy order_events_participants on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_events.order_id));

create policy order_proofs_participants on public.order_proofs for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_proofs.order_id));

create policy payments_participants on public.payments for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = payments.order_id and (o.buyer_id = auth.uid() or public.is_admin())
  ));

create policy driver_ledger_own on public.driver_ledger for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());

create policy audit_log_admin on public.audit_log for select to authenticated
  using (public.is_admin());

-- otp_requests dan order_transitions: tanpa policy, jadi tertutup untuk browser.

-- ---------------------------------------------------------------------------
-- Data awal
-- ---------------------------------------------------------------------------

insert into public.zones (slug, name) values
  ('jatinangor', 'Jatinangor');
