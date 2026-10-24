import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Modul server dijaga dengan paket "server-only": build gagal bila diimpor dari komponen klien.
const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
];

export default config;
