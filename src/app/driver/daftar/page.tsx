import type { Metadata } from "next";
import Link from "next/link";
import { createSessionClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { ApplicationForm, DocumentUpload, type ApplicationDefaults } from "./ApplicationForms";

export const metadata: Metadata = { title: "Daftar driver" };

const KINDS = ["ktm", "ktp", "sim", "stnk"] as const;

export default async function DriverApplyPage() {
  const user = await requireUser("/driver/daftar");
  if (user.roles.has("driver")) {
    return (
      <div className="card space-y-2">
        <p>Kamu sudah terdaftar sebagai driver.</p>
        <Link href="/driver" className="btn w-full">
          Buka halaman driver
        </Link>
      </div>
    );
  }

  const supabase = await createSessionClient();
  const [{ data: app }, { data: docs }] = await Promise.all([
    supabase
      .from("driver_applications")
      .select("status, review_note, full_name, nim, campus, vehicle_type, plate_number, bank_name, bank_account_number, bank_account_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("driver_documents").select("kind").eq("user_id", user.id),
  ]);
  const uploaded = new Set((docs ?? []).map((d) => d.kind as string));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Daftar jadi driver</h1>
        <p className="text-sm text-stone-600">
          Untuk mahasiswa aktif. Tanpa kuota, ON kapan pun kamu sempat. Setelah data dan dokumen lengkap,
          admin akan menghubungi untuk wawancara online.
        </p>
      </div>

      {app?.status === "rejected" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Pendaftaran sebelumnya ditolak{app.review_note ? `: ${app.review_note}` : "."} Kamu bisa mendaftar ulang.
        </p>
      )}
      {app?.status === "pending" && uploaded.size === KINDS.length && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Data dan dokumen lengkap. Tunggu jadwal wawancara dari admin.
        </p>
      )}

      <section className="card">
        <ApplicationForm defaults={(app ?? {}) as ApplicationDefaults} />
      </section>

      {app?.status === "pending" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Dokumen</h2>
          <p className="text-xs text-stone-500">
            JPG, PNG, WEBP, atau PDF, maks. 4 MB. Disimpan di penyimpanan privat, tidak punya link publik.
          </p>
          {KINDS.map((k) => (
            <DocumentUpload key={k} kind={k} uploaded={uploaded.has(k)} />
          ))}
        </section>
      )}
    </div>
  );
}
