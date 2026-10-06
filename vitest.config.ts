import { defineConfig } from "vitest/config";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const testDataDir = mkdtempSync(join(tmpdir(), "x-it-test-"));
process.env.X_IT_DATA_DIR = testDataDir;
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-value-0123456789abcdef";
process.env.SANDBOX_BACKEND = process.env.SANDBOX_BACKEND || "local";
process.env.X_IT_AUTO_APPROVE = "false";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 180_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": join(__dirname, "."),
    },
  },
});
