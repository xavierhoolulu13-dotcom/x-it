import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Runtime data directories.
 *
 * Everything X-IT writes at runtime lives under a single data directory so it can
 * be mounted as a volume in production and ignored by git in development.
 */
export const DATA_DIR =
  process.env.X_IT_DATA_DIR && process.env.X_IT_DATA_DIR.length > 0
    ? process.env.X_IT_DATA_DIR
    : join(process.cwd(), ".x-it-data");

export const WORKSPACES_DIR = join(DATA_DIR, "workspaces");
export const BROWSER_DIR = join(DATA_DIR, "browser");
export const STATE_FILE = join(DATA_DIR, "x-it.json");
export const AUDIT_EXPORT_DIR = join(DATA_DIR, "exports");

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataDirs(): string[] {
  return [DATA_DIR, WORKSPACES_DIR, BROWSER_DIR, AUDIT_EXPORT_DIR];
}
