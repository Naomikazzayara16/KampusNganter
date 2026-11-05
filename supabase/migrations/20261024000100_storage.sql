-- Bucket penyimpanan privat. Tidak ada policy untuk anon/authenticated di storage.objects,
-- jadi file hanya bisa diunggah dan dibaca lewat server (service_role), yang membuat
-- link sementara setelah mengecek hak akses dan mencatatnya di audit_log.
--
-- Dibungkus pengecekan agar migrasi tetap jalan di database tes tanpa skema storage.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('driver-documents', 'driver-documents', false, 4194304,
       array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
      ('order-proofs', 'order-proofs', false, 4194304,
       array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
