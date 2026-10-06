#!/usr/bin/env node
/**
 * Resolve a Chromium binary + its runtime libraries for the X-IT browser engine.
 *
 * Strategy:
 *   1. Honour X_IT_CHROME_EXECUTABLE_PATH / CHROME_EXECUTABLE_PATH if set.
 *   2. Otherwise extract the Chromium build bundled with @sparticuz/chromium
 *      into /tmp (chromium binary, fonts, swiftshader and — on non-Amazon Linux
 *      hosts — the bundled al2023 shared libraries it links against).
 *
 * Prints a single JSON line describing the result so it can be consumed from
 * Node without any extra dependencies:
 *   { "executablePath", "libDir", "fontsDir", "source", "args" }
 *
 * Exits non-zero with a JSON error object on failure.
 */
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(message) {
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
}

async function main() {
  const explicit = process.env.X_IT_CHROME_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  if (explicit) {
    if (!existsSync(explicit)) fail(`X_IT_CHROME_EXECUTABLE_PATH does not exist: ${explicit}`);
    emit({
      executablePath: explicit,
      libDir: process.env.X_IT_CHROME_LIB_DIR || null,
      fontsDir: existsSync(join(tmpdir(), "fonts")) ? join(tmpdir(), "fonts") : null,
      source: "env",
      args: [],
    });
    return;
  }

  let chromium;
  try {
    chromium = (await import("@sparticuz/chromium")).default;
  } catch (error) {
    fail(`@sparticuz/chromium is not installed: ${error instanceof Error ? error.message : error}`);
  }

  let executablePath;
  try {
    executablePath = await chromium.executablePath();
  } catch (error) {
    fail(`Could not extract Chromium: ${error instanceof Error ? error.message : error}`);
  }

  // The bundled binary links against AL2023 libraries that the package only
  // inflates when it detects Amazon Linux. Inflate them ourselves so the binary
  // runs on Debian/Ubuntu/other hosts too.
  let libDir = process.env.X_IT_CHROME_LIB_DIR || null;
  if (!libDir) {
    const al2023 = join(tmpdir(), "al2023");
    const al2023Lib = join(al2023, "lib");
    if (!existsSync(join(al2023Lib, "libnspr4.so"))) {
      try {
        const pkgEntry = require.resolve("@sparticuz/chromium");
        const pkgRoot = dirname(dirname(pkgEntry));
        const archive = join(pkgRoot, "bin", "al2023.tar.br");
        if (existsSync(archive)) {
          // `inflate` is re-exported from the package root; the internal build
          // path is not reachable through the package's `exports` map.
          const { inflate } = await import("@sparticuz/chromium");
          await inflate(archive);
        }
      } catch (error) {
        process.stderr.write(
          `[prepare-chromium] could not inflate bundled libraries: ${error instanceof Error ? error.message : error}\n`
        );
      }
    }
    if (existsSync(join(al2023Lib, "libnspr4.so"))) libDir = al2023Lib;
  }

  const fontsDir = join(tmpdir(), "fonts");
  emit({
    executablePath,
    libDir,
    fontsDir: existsSync(fontsDir) ? fontsDir : null,
    source: "bundled",
    // Raw recommended flags. The engine filters flags that break multi-context
    // operation (see BLOCKED_FLAGS in lib/browser/engine.ts).
    args: chromium.args,
  });
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
