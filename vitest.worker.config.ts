import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          BLURAY_COLLECTION_URL:
            "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
          TMDB_READ_ACCESS_TOKEN:
            "test-tmdb-read-token-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789",
          SYNC_ADMIN_TOKEN: "test-sync-token-abcdefghijklmnopqrstuvwxyz-1234567890",
        },
      },
    })),
  ],
  test: {
    include: ["worker/**/*.test.ts"],
    setupFiles: ["./worker/test/setup.ts"],
  },
});
