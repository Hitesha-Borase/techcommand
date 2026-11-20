import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(rootDir, "drizzle"));

  return {
    resolve: {
      alias: { "@": rootDir },
    },
    test: {
      include: ["tests/**/*.vitest.test.ts"],
      setupFiles: ["./tests/vitest.setup.ts"],
      testTimeout: 30000,
      hookTimeout: 30000,
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.toml" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations as any },
        },
      }),
    ],
  };
});
