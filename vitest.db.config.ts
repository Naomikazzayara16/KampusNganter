import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tes database butuh Postgres (lokal atau service di CI) lewat TEST_DATABASE_URL.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
