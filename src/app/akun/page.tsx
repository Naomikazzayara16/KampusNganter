import type { Metadata } from "next";
import { maskPhone } from "@/domain/phone";
import { signOut } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Akun" };

export default async function AccountPage() {
  const user = await requireUser("/akun");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Akun</h1>
      <div className="card space-y-3">
        <p className="text-sm text-stone-600">Nomor HP: {maskPhone(user.phone)}</p>
        <ProfileForm displayName={user.displayName} />
      </div>
      <form action={signOut}>
        <button type="submit" className="btn-secondary w-full">
          Keluar
        </button>
      </form>
    </div>
  );
}
