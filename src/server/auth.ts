import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";

export type Role = "buyer" | "driver" | "admin";

export type CurrentUser = {
  id: string;
  phone: string;
  displayName: string;
  roles: ReadonlySet<Role>;
};

/**
 * Pengguna yang sedang login, diverifikasi ke server Supabase (getUser),
 * bukan hanya dibaca dari cookie. Di-cache per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle(),
  ]);

  return {
    id: data.user.id,
    phone: data.user.phone ? `+${data.user.phone.replace(/^\+/, "")}` : "",
    displayName: (profile?.display_name as string | undefined) ?? "Pengguna",
    roles: new Set((roles ?? []).map((r) => r.role as Role)),
  };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/masuk?lanjut=${encodeURIComponent(next)}` : "/masuk");
  return user;
}

/** Untuk halaman admin: pengguna tanpa peran tidak diberi tahu bahwa halaman ini ada. */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.roles.has(role)) notFound();
  return user;
}
