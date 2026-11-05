import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/redirect";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage(props: PageProps<"/masuk">) {
  const { lanjut } = await props.searchParams;
  const next = safeNextPath(typeof lanjut === "string" ? lanjut : undefined);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="card space-y-4">
      <div>
        <h1 className="text-xl font-bold">Masuk atau daftar</h1>
        <p className="text-sm text-stone-600">
          Cukup nomor HP. Kami kirim kode OTP, tanpa password. Nomormu tidak dibagikan ke driver.
        </p>
      </div>
      <LoginForm next={next} />
    </div>
  );
}
