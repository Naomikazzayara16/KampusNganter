# KampusNganter

Web app (PWA) untuk antar/ambil barang dan titip beli makanan oleh mahasiswa terverifikasi,
dimulai dari Jatinangor. Dibuka dari link Instagram, tanpa perlu instal.

Rancangan bisnis: lihat dokumen "CampusDev — Rancangan Alur Bisnis End-to-End".

## Stack

| Bagian | Pilihan |
| --- | --- |
| Bahasa | TypeScript (strict) |
| Web app | Next.js 16 (App Router, Server Actions) + Tailwind CSS |
| Database & login | Supabase: Postgres dengan Row Level Security, login OTP nomor HP |
| File | Supabase Storage, bucket privat |
| Validasi | Zod |
| Peta | Leaflet + OpenStreetMap |
| Tes | Vitest (aturan bisnis + database/RLS), GitHub Actions |

## Struktur

```
src/
  domain/      aturan bisnis murni tanpa framework: tarif, status order, kode unik, refund
  lib/         env, klien Supabase, validasi form
  server/      cek sesi & peran, server actions (tulis), queries (baca), storage, audit
  components/  komponen UI bersama
  app/         halaman (UI bahasa Indonesia): /pesan, /pesanan, /driver, /admin, /masuk
  proxy.ts     CSP per request + perpanjangan sesi
supabase/migrations/   skema, RLS, fungsi database
tests/domain/          tes unit aturan bisnis
tests/db/              tes keamanan database di Postgres sungguhan
```

## Prinsip keamanan

- **Baca lewat RLS, tulis lewat server.** Browser tidak punya hak menulis ke tabel mana pun.
  Semua perubahan lewat server action → fungsi database yang mengecek aktor dan status.
- **Uang dihitung di server dan dijaga database.** Ongkir dihitung ulang di server; constraint
  memastikan `total = ongkir + biaya layanan + budget`, angka tagihan tidak bisa diubah setelah
  order dibuat, dan pembagian dana saat selesai/batal selalu seimbang.
- **Status order tidak bisa melompat.** Daftar perpindahan sah ada di
  `src/domain/order-status.ts` dan tabel `order_transitions`; tes memastikan keduanya sama.
- **Satu order, satu driver.** Klaim memakai row lock; driver maksimal memegang 2 order.
- **Data pribadi.** Nomor HP tidak bisa dibaca lewat API (bahkan tidak di-grant), tidak pernah
  ditampilkan ke driver; catatan order disaring dari nomor/username/link sebelum dilihat driver.
  Dokumen KTM/KTP/SIM/STNK di bucket privat, nama file acak, tipe dicek dari isi file, hanya
  admin yang bisa membuka lewat link 5 menit, setiap pembukaan dicatat, dan dokumen pendaftar
  yang ditolak dihapus (UU PDP No. 27/2022).
- **Log tidak bisa diubah.** `order_events`, `payments`, `driver_ledger`, `audit_log` hanya bisa
  ditambah, bahkan oleh server.
- **Login.** OTP nomor HP (tanpa password), dibatasi 3 kali per nomor per 15 menit dan 10 kali
  per IP per jam; nomor dan IP disimpan sebagai HMAC. Redirect setelah login hanya ke path internal.
- **Web.** CSP dengan nonce per request, HSTS, `X-Frame-Options: DENY`, proteksi CSRF bawaan
  Server Actions, batas ukuran unggahan 4 MB.
- **Rahasia** hanya di environment variable. Tidak ada kunci di repo.

## Menjalankan secara lokal

1. Node 22 dan akun [Supabase](https://supabase.com) (gratis).
2. Buat proyek Supabase (region Singapura), lalu jalankan migrasi:
   `npx supabase link --project-ref <ref>` lalu `npx supabase db push`
   (atau tempel isi `supabase/migrations/*.sql` berurutan di SQL Editor).
3. Supabase → Authentication → Providers → **Phone**: aktifkan dan isi penyedia SMS/WA
   (mis. Twilio). Matikan login email/password bila tidak dipakai.
4. `cp .env.example .env.local`, isi nilainya.
5. `npm ci && npm run dev`, buka http://localhost:3000.
6. Jadikan akunmu admin (sekali, di SQL Editor), setelah login pertama:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where phone = '62812xxxxxxxx';
   ```

## Tes

```bash
npm test                 # aturan bisnis
npm run test:db          # database & RLS, butuh Postgres 15+ (TEST_DATABASE_URL)
npm run typecheck && npm run lint
```

## Belum ada di versi ini

Notifikasi push, posisi driver di peta, chat dalam aplikasi, titip bareng, katalog harga, rating,
pencocokan pembayaran otomatis, refund otomatis, dan bayar saat terima. Lihat roadmap di dokumen
rancangan.
