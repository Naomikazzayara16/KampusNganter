"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { submitApplication, uploadDocument } from "@/server/actions/driver";
import type { ActionState } from "@/server/result";

export type ApplicationDefaults = Partial<{
  full_name: string;
  nim: string;
  campus: string;
  vehicle_type: string;
  plate_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
}>;

const FIELDS: Array<{ name: string; key: keyof ApplicationDefaults; label: string; placeholder?: string; inputMode?: "numeric" }> = [
  { name: "fullName", key: "full_name", label: "Nama lengkap (sesuai KTP)" },
  { name: "nim", key: "nim", label: "NIM", placeholder: "Dicek ke PDDikti" },
  { name: "campus", key: "campus", label: "Kampus", placeholder: "Unpad / ITB / IPDN / IKOPIN" },
  { name: "vehicleType", key: "vehicle_type", label: "Kendaraan", placeholder: "Honda Beat hitam" },
  { name: "plateNumber", key: "plate_number", label: "Plat nomor", placeholder: "D 1234 ABC" },
  { name: "bankName", key: "bank_name", label: "Bank (sama dengan rekening usaha, mis. BRI)" },
  { name: "bankAccountNumber", key: "bank_account_number", label: "Nomor rekening", inputMode: "numeric" },
  { name: "bankAccountName", key: "bank_account_name", label: "Nama pemilik rekening" },
];

export function ApplicationForm({ defaults }: { defaults: ApplicationDefaults }) {
  const [state, action] = useActionState<ActionState, FormData>(submitApplication, null);
  return (
    <form action={action} className="space-y-3">
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            defaultValue={defaults[f.key] ?? ""}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
            required
            className="input"
          />
        </div>
      ))}
      <label className="flex gap-2 text-sm text-stone-700">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>
          Saya setuju KampusNganter memproses data dan dokumen saya (KTM, KTP, SIM, STNK) hanya untuk
          verifikasi mitra driver, sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
          Dokumen hanya dilihat admin dan dihapus bila pendaftaran ditolak.
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton>Simpan data</SubmitButton>
    </form>
  );
}

const DOC_LABELS = { ktm: "KTM", ktp: "KTP", sim: "SIM C", stnk: "STNK" } as const;

export function DocumentUpload({ kind, uploaded }: { kind: keyof typeof DOC_LABELS; uploaded: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(uploadDocument, null);
  return (
    <form action={action} className="card space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex items-center justify-between">
        <span className="font-medium">{DOC_LABELS[kind]}</span>
        <span className={`text-xs ${uploaded ? "text-emerald-700" : "text-stone-500"}`}>
          {uploaded ? "✓ Terunggah" : "Belum"}
        </span>
      </div>
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="text-sm" />
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary w-full" pendingText="Mengunggah…">
        {uploaded ? "Ganti file" : "Unggah"}
      </SubmitButton>
    </form>
  );
}
