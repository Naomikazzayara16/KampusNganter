"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Memuat ulang data halaman secara berkala selama tab terlihat (pengganti push untuk buyer). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
