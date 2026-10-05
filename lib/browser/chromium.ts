import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ChromiumDescriptor {
  executablePath: string;
  libDir: string | null;
  fontsDir: string | null;
  source: string;
  args?: string[];
}

let cached: ChromiumDescriptor | null = null;

function runPrepareScript(): Promise<ChromiumDescriptor> {
  const script = join(process.cwd(), "scripts", "prepare-chromium.mjs");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [script],
      { timeout: 300_000, maxBuffer: 1024 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(`Chromium is unavailable: ${stderr || error.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim().split("\n").pop() || "{}") as ChromiumDescriptor;
          if (!parsed.executablePath) throw new Error("missing executablePath");
          resolve(parsed);
        } catch (parseError) {
          reject(
            new Error(
              `Could not parse Chromium descriptor: ${parseError instanceof Error ? parseError.message : String(parseError)}`
            )
          );
        }
      }
    );
  });
}

/**
 * Locate a Chromium binary usable by puppeteer-core, extracting one from the
 * bundled @sparticuz/chromium package if the host has none installed.
 */
export async function resolveChromium(force = false): Promise<ChromiumDescriptor> {
  if (cached && !force) return cached;

  const explicit = process.env.X_IT_CHROME_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) {
    cached = {
      executablePath: explicit,
      libDir: process.env.X_IT_CHROME_LIB_DIR || null,
      fontsDir: null,
      source: "env",
    };
    return cached;
  }

  cached = await runPrepareScript();
  return cached;
}

export function chromiumEnv(descriptor: ChromiumDescriptor): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (descriptor.libDir) {
    env.LD_LIBRARY_PATH = [descriptor.libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  }
  if (descriptor.fontsDir) {
    env.FONTCONFIG_PATH = env.FONTCONFIG_PATH || descriptor.fontsDir;
  }
  env.HOME = env.HOME || "/tmp";
  return env;
}

export function chromiumAvailable(): boolean {
  const explicit = process.env.X_IT_CHROME_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  return Boolean(explicit && existsSync(explicit)) || existsSync(join("/tmp", "chromium"));
}
