import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KampusNganter", template: "%s · KampusNganter" },
  description: "Antar, ambil, dan titip beli oleh sesama mahasiswa terverifikasi di Jatinangor.",
  applicationName: "KampusNganter",
  appleWebApp: { capable: true, title: "KampusNganter", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="id">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-brand">
              KampusNganter
            </Link>
            <div className="flex items-center gap-3 text-sm font-medium">
              {user ? (
                <>
                  <Link href="/pesanan">Pesanan</Link>
                  {user.roles.has("driver") && <Link href="/driver">Driver</Link>}
                  {user.roles.has("admin") && <Link href="/admin">Admin</Link>}
                  <Link href="/akun">Akun</Link>
                </>
              ) : (
                <Link href="/masuk" className="text-brand">
                  Masuk
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
