/// <reference types="@cloudflare/vitest-plugin/types" />
import { applyD1Migrations, env } from "cloudflare:test";

// Applies the real drizzle/*.sql migrations (read in vitest.config.ts and passed in as the
// TEST_MIGRATIONS binding) to the Miniflare-simulated D1 database before each test file runs,
// so integration tests exercise the actual production schema and SQL queries.
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);
