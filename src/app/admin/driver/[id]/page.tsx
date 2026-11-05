import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth";
import { signedUrl, SIGNED_URL_SECONDS } from "@/server/storage";
import { ReviewForm } from "./ReviewForm";

export const metadata: Metadata = { title: "Verifikasi driver", robots: { index: false } };

const DOC_LABELS: Record<string, string> = { ktm: "KTM", ktp: "KTP", sim: "SIM", stnk: "STNK" };

export default async function AdminDriverPage(props: PageProps<"/admin/driver/[id]">) {
  const { id } = await props.params;
  const admin = await requireRole("admin");
  if (!uuid.safeParse(id).success) notFound();

  const supabase = await createSessionClient();
  const [{ data: app }, { data: docs }] = await Promise.all([
    supabase.from("driver_applications").select("*").eq("user_id", id).maybeSingle(),
    supabase.from("driver_documents").select("id, kind, storage_path, mime").eq("user_id", id),
  ]);
  if (!app) notFound();

  // Setiap pembukaan dokumen identitas dicatat siapa dan kapan.
  const documents = await Promise.all(
    (docs ?? []).map(async (d) => {
      await audit(admin.id, "driver_document.view", { type: "driver_document", id: d.id as string }, {
        kind: d.kind as string,
      });
      return { ...d, url: await signedUrl("driver-documents", d.storage_path as string) };
    }),
  );

  const fields: Array<[string, unknown]> = [
    ["Nama", app.full_name],
    ["NIM", app.nim],
    ["Kampus", app.campus],
    ["Kendaraan", app.vehicle_type],
    ["Plat", app.plate_number],
    ["Bank", `${app.bank_name as string} · ${app.bank_account_number as string} a.n. ${app.bank_account_name as string}`],
    ["Status", app.status],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Verifikasi driver</h1>
      <dl className="card space-y-1 text-sm">
        {fields.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-stone-500">{k}</dt>
            <dd className="text-right">{String(v)}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="font-semibold">Dokumen ({documents.length}/4)</h2>
        <p className="text-xs text-stone-500">Link berlaku {SIGNED_URL_SECONDS / 60} menit dan tercatat di log audit.</p>
        <ul className="grid grid-cols-2 gap-3">
          {documents.map((d) => (
            <li key={d.id as string} className="card text-sm">
              <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">
                Buka {DOC_LABELS[d.kind as string]}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {app.status === "pending" && (
        <ReviewForm userId={id} suggestedNickname={String(app.full_name).split(" ")[0] ?? ""} />
      )}
    </div>
  );
}
