import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KampusNganter",
    short_name: "KampusNganter",
    description: "Antar, ambil, dan titip beli oleh sesama mahasiswa.",
    start_url: "/pesanan",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0f766e",
    lang: "id",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
