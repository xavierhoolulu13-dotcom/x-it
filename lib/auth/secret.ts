import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ensureDir, DATA_DIR } from "@/lib/runtime/paths";
import { join } from "node:path";

const SECRET_FILE = join(DATA_DIR, ".nextauth-secret");

/**
 * Returns a stable NextAuth secret.
 *
 * Priority: NEXTAUTH_SECRET env var → persisted secret in the data dir →
 * freshly generated secret (persisted so sessions survive restarts).
 */
export function getAuthSecret(): string {
  if (process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 16) {
    return process.env.NEXTAUTH_SECRET;
  }
  try {
    if (existsSync(SECRET_FILE)) {
      const existing = readFileSync(SECRET_FILE, "utf8").trim();
      if (existing.length >= 16) return existing;
    }
    const generated = randomBytes(32).toString("hex");
    ensureDir(DATA_DIR);
    writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    return generated;
  } catch {
    // Last resort: deterministic value derived from a fixed salt. Only reached
    // when the data dir is not writable (read-only deployments must set
    // NEXTAUTH_SECRET explicitly).
    return "x-it-development-secret-do-not-use-in-production";
  }
}

export function isAuthSecretFromEnv(): boolean {
  return Boolean(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 16);
}
