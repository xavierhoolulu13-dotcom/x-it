#!/usr/bin/env node
/**
 * X-IT production end-to-end verification.
 *
 * Runs against a REAL production server (`next build && next start`) using a
 * REAL headless Chromium, and exercises:
 *
 *   1. /api/health                     — service + backend readiness
 *   2. /register + /login forms        — real credential auth (NextAuth)
 *   3. dashboard access control        — unauthenticated redirect
 *   4. chat streaming + agent tool loop — file_write, terminal_exec, code_run
 *   5. sandbox file API                — verify the file the agent wrote
 *   6. browser automation API          — real navigation + screenshot of the app
 *   7. preview proxy                   — start a sandbox server, fetch through the proxy
 *   8. approvals + audit trail         — decision flow and audit entries
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e-production.mjs
 *
 * Exits non-zero if any check fails. Screenshots and a JSON report are written
 * to ./artifacts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { launch } from "puppeteer-core";

/** Resolve Chromium the same way the app does (via scripts/prepare-chromium.mjs). */
function resolveChromiumDescriptor() {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [join(process.cwd(), "scripts", "prepare-chromium.mjs")],
      { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(`chromium unavailable: ${stderr || error.message}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim().split("\n").pop()));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

function chromiumEnvFor(descriptor) {
  const env = { ...process.env };
  if (descriptor.libDir) {
    env.LD_LIBRARY_PATH = [descriptor.libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  }
  env.FONTCONFIG_PATH = env.FONTCONFIG_PATH || descriptor.fontsDir || join(tmpdir(), "fonts");
  env.HOME = env.HOME || tmpdir();
  return env;
}

const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const API_TOKEN = process.env.X_IT_API_TOKEN || "";
const ARTIFACTS = join(process.cwd(), "artifacts");

const results = [];
let failed = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail, at: new Date().toISOString() });
  const badge = ok ? "PASS" : "FAIL";
  console.log(`${badge}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
    return detail;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Authenticated API access.
 *
 * Once the E2E is signed in, every API call is issued from inside the real
 * browser page so it carries the NextAuth session cookie exactly like the app
 * does. Before sign-in (or when no page is available) it falls back to the
 * bearer token, which the middleware also accepts.
 */
let currentPage = null;
let sessionCookieHeader = "";

function authHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  if (!currentPage && sessionCookieHeader) headers.Cookie = sessionCookieHeader;
  else if (!currentPage && API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
  return headers;
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const body = options.body;
  const headers = options.headers || {};

  if (currentPage) {
    return currentPage.evaluate(
      async (base, p, opts) => {
        const res = await fetch(base + p, {
          method: opts.method,
          body: opts.body,
          headers: opts.headers,
        });
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* non-JSON response */
        }
        return { status: res.status, ok: res.ok, json, text };
      },
      BASE,
      path,
      {
        method,
        body,
        headers: Object.fromEntries(
          Object.entries(headers).filter(([key]) => key.toLowerCase() !== "cookie")
        ),
      }
    );
  }

  const res = await fetch(`${BASE}${path}`, { method, body, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, ok: res.ok, json, text };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  console.log(`\nX-IT production E2E → ${BASE}\n${"=".repeat(58)}`);

  // ---------------------------------------------------------------- 1. health
  await check("health endpoint reports a healthy service", async () => {
    const health = await api("/api/health");
    if (!health.ok) throw new Error(`status ${health.status}`);
    if (health.json.status !== "ok") throw new Error(JSON.stringify(health.json.checks));
    return `sandbox=${health.json.checks.sandbox?.detail} ai=${health.json.checks.ai?.detail}`;
  });

  await check("version endpoint reports v3", async () => {
    const version = await api("/api/version");
    if (!version.ok || !version.json.version.startsWith("3.")) throw new Error("not v3");
    return `v${version.json.version}`;
  });

  // --------------------------------------------------- 2. auth + browser E2E
  const descriptor = await resolveChromiumDescriptor();
  const browser = await launch({
    executablePath: descriptor.executablePath,
    headless: true,
    env: chromiumEnvFor(descriptor),
    args: [...(descriptor.args || []), "--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1280, height: 900 },
  });

  const email = `e2e+${Date.now().toString(36)}@xit.test`;
  const password = "Prod-E2E-1234";

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);

    await check("unauthenticated /chat redirects to /login", async () => {
      await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
      if (!page.url().includes("/login")) throw new Error(`landed on ${page.url()}`);
      return page.url().replace(BASE, "");
    });

    writeFileSync(join(ARTIFACTS, "01-login.png"), await page.screenshot({ type: "png" }));

    await check("registration form creates an account via the UI", async () => {
      await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#name");
      await page.type("#name", "E2E Runner");
      await page.type("#email", email);
      await page.type("#password", password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null),
        page.click('button[type="submit"]'),
      ]);
      await sleep(2500);
      const url = page.url();
      if (!url.includes("/chat")) throw new Error(`expected /chat, got ${url}`);
      return `signed in as ${email}`;
    });

    writeFileSync(join(ARTIFACTS, "02-dashboard.png"), await page.screenshot({ type: "png" }));

    await check("session cookie (not a token) authenticates every API call", async () => {
      currentPage = page;
      const cookies = await page.cookies();
      const sessionCookie = cookies.find((c) => c.name.includes("session-token"));
      if (!sessionCookie) throw new Error("no session cookie set");

      const whoami = await api("/api/conversations");
      if (!whoami.ok) throw new Error(`API rejected the session cookie (${whoami.status})`);

      // Prove the session is what authorizes us: the same call without the
      // browser context and without a token must fail.
      currentPage = null;
      const anonymous = await fetch(`${BASE}/api/conversations`);
      currentPage = page;
      if (anonymous.status !== 401) throw new Error(`expected 401 without credentials, got ${anonymous.status}`);

      return `${sessionCookie.name} accepted; anonymous request rejected`;
    });

    // -------------------------------------------- 3. browser automation (UI tab)
    await check("browser panel drives real Chromium against the production app", async () => {
      await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
      await sleep(1500);
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const target = buttons.find((b) => b.textContent?.trim().includes("Browser"));
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      if (!clicked) throw new Error("browser tab button not found");
      await sleep(1200);

      // Start the session from the panel and navigate to the running app itself.
      const started = await page.evaluate(async (base) => {
        const res = await fetch("/api/browser/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${base}/login`, name: "E2E browser" }),
        });
        return { status: res.status, body: await res.json() };
      }, BASE);
      if (started.status !== 201) throw new Error(`session create failed: ${JSON.stringify(started.body)}`);
      const sessionId = started.body.state.sessionId;
      globalThis.__browserSessionId = sessionId;
      return `session ${sessionId} → ${started.body.state.title || started.body.state.url}`;
    });

    await check("browser session captured a screenshot of the production app", async () => {
      const sessionId = globalThis.__browserSessionId;
      const shot = await page.evaluate(async (id) => {
        const res = await fetch(`/api/browser/sessions/${id}/screenshot?format=png`);
        if (!res.ok) return { ok: false, status: res.status, base64: "" };
        const buffer = await res.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { ok: true, status: res.status, base64: btoa(binary) };
      }, sessionId);
      if (!shot.ok) throw new Error(`screenshot status ${shot.status}`);
      const buffer = Buffer.from(shot.base64, "base64");
      if (buffer.length < 5000) throw new Error(`screenshot suspiciously small (${buffer.length} bytes)`);
      writeFileSync(join(ARTIFACTS, "03-browser-automation.png"), buffer);
      return `${buffer.length} bytes of PNG`;
    });

    await check("browser extracts readable content from the login page", async () => {
      const sessionId = globalThis.__browserSessionId;
      const content = await api(`/api/browser/sessions/${sessionId}/content?format=markdown`);
      if (!content.ok) throw new Error(`status ${content.status}`);
      const text = content.json.content || "";
      if (!/X-IT/i.test(text)) throw new Error(`page content did not mention X-IT: ${text.slice(0, 120)}`);
      return `${text.length} chars extracted`;
    });

    // --------------------------------------------- 4. agent tool loop via chat
    await check("chat agent streams a reply and executes real tools", async () => {
      const events = await page.evaluate(async () => {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              "create a file ./hello-xit.txt with the text 'production e2e verified' and then run the shell command 'ls -la'",
            model: "x-it-demo-agent",
            autoApprove: true,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`stream status ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let raw = "";
        const collected = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          const parts = raw.split("\n\n");
          raw = parts.pop() || "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              collected.push(JSON.parse(payload));
            } catch {
              /* ignore */
            }
          }
        }
        return collected;
      });

      const toolResults = events.filter((e) => e.type === "tool_result");
      const text = events.filter((e) => e.type === "text").map((e) => e.content).join("");
      globalThis.__e2e = { events, text };

      if (toolResults.length === 0) throw new Error("agent executed no tools");
      const completed = toolResults.filter((e) => e.ok);
      if (completed.length === 0) {
        throw new Error(`all tool calls failed: ${JSON.stringify(toolResults.map((t) => t.error))}`);
      }
      writeFileSync(
        join(ARTIFACTS, "04-chat-events.json"),
        JSON.stringify({ events, text }, null, 2)
      );
      return `${completed.length}/${toolResults.length} tool calls succeeded`;
    });

    await check("conversation, messages and tool calls were persisted", async () => {
      const conversations = await api("/api/conversations");
      if (!conversations.ok || conversations.json.conversations.length === 0) {
        throw new Error("no conversations stored");
      }
      const conversation = conversations.json.conversations[0];
      const detail = await api(`/api/conversations/${conversation.id}`);
      const messages = detail.json.messages || [];
      const toolCalls = messages.flatMap((m) => m.toolCalls || []);
      if (messages.length < 2) throw new Error(`expected user+assistant messages, got ${messages.length}`);
      return `${messages.length} messages, ${toolCalls.length} tool calls recorded`;
    });

    // ------------------------------------------------ 5. sandbox file API check
    await check("sandbox contains the file the agent wrote", async () => {
      const sandboxes = await api("/api/sandbox");
      if (!sandboxes.ok || sandboxes.json.sandboxes.length === 0) throw new Error("no sandbox");
      const sandboxId = sandboxes.json.sandboxes[0].id;
      const read = await api(`/api/files/${sandboxId}/read?path=./hello-xit.txt`);
      if (!read.ok) throw new Error(read.json?.error || `status ${read.status}`);
      if (!read.json.content.includes("production e2e verified")) {
        throw new Error(`unexpected content: ${read.json.content.slice(0, 80)}`);
      }
      globalThis.__sandboxId = sandboxId;
      return `${read.json.content.trim().slice(0, 48)} (${sandboxes.json.backend} backend)`;
    });

    await check("terminal API really executes commands", async () => {
      const sandboxId = globalThis.__sandboxId;
      const exec = await api(`/api/terminal/${sandboxId}/exec`, {
        method: "POST",
        body: JSON.stringify({ command: "echo e2e-$((21*2)) && pwd" }),
      });
      if (!exec.ok) throw new Error(exec.json?.error || `status ${exec.status}`);
      if (!exec.json.stdout.includes("e2e-42")) throw new Error(`stdout: ${exec.json.stdout}`);
      return exec.json.stdout.split("\n")[0];
    });

    await check("dangerous commands are blocked by policy", async () => {
      const sandboxId = globalThis.__sandboxId;
      const exec = await api(`/api/terminal/${sandboxId}/exec`, {
        method: "POST",
        body: JSON.stringify({ command: "rm -rf / --no-preserve-root" }),
      });
      if (exec.status !== 403) throw new Error(`expected 403, got ${exec.status}`);
      return "rm -rf / refused";
    });

    await check("code_run executes Python in the sandbox", async () => {
      const exec = await api("/api/tools/execute", {
        method: "POST",
        body: JSON.stringify({
          tool: "code_run",
          arguments: { language: "python", code: "print('py', sum(range(10)))" },
          autoApprove: true,
        }),
      });
      if (!exec.ok) throw new Error(exec.json?.result?.error || `status ${exec.status}`);
      if (!exec.json.result.output.includes("py 45")) throw new Error(exec.json.result.output.slice(0, 120));
      return "python output verified";
    });

    // ------------------------------------------------------- 6. preview proxy
    await check("sandbox server + preview proxy serve a live app", async () => {
      const sandboxId = globalThis.__sandboxId;
      const start = await api("/api/tools/execute", {
        method: "POST",
        body: JSON.stringify({
          tool: "server_start",
          arguments: { command: "python3 -m http.server $PORT --bind 127.0.0.1" },
          autoApprove: true,
        }),
      });
      if (!start.ok) throw new Error(start.json?.result?.error || `status ${start.status}`);

      let served = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        await sleep(700);
        const preview = await api(`/api/preview/${sandboxId}/`);
        const res = { ok: preview.ok, text: async () => preview.text };
        if (res.ok) {
          served = await res.text();
          break;
        }
      }
      if (!served) throw new Error("preview proxy never returned 200");
      if (!/hello-xit/.test(served)) throw new Error("directory listing did not include the agent's file");
      return `proxy served ${served.length} bytes from port ${start.json.result.data.port}`;
    });

    // ------------------------------------------------- 7. approvals + audit
    await check("approval queue requires a decision (and records it)", async () => {
      // Trigger an approval-required tool without auto-approval. The request is
      // started inside the page and left pending while we decide in the UI/API.
      await page.evaluate(() => {
        window.__pendingApprovalTool = fetch("/api/tools/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: "file_write",
            arguments: { path: "./approval-check.txt", content: "gated" },
            autoApprove: false,
          }),
        }).then((res) => res.json());
      });

      let approval = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        await sleep(400);
        const list = await api("/api/approvals?status=PENDING");
        approval = (list.json?.approvals || []).find((a) => a.toolName === "file_write");
        if (approval) break;
      }
      if (!approval) throw new Error("no pending approval appeared");

      const decide = await api(`/api/approvals/${approval.id}/approve`, { method: "POST" });
      if (!decide.ok) throw new Error(decide.json?.error || `status ${decide.status}`);

      const result = await page.evaluate(() => window.__pendingApprovalTool);
      if (!result?.result?.ok) throw new Error(`tool did not run after approval: ${JSON.stringify(result)}`);
      return `approval ${approval.id} approved, tool executed`;
    });

    await check("audit trail contains auth, tool and approval events", async () => {
      const audit = await api("/api/audit?limit=200");
      if (!audit.ok) throw new Error(`status ${audit.status}`);
      const actions = new Set((audit.json.logs || []).map((l) => l.action));
      const required = ["auth.register", "tool.completed", "approval.approved"];
      const missing = required.filter((r) => !actions.has(r));
      if (missing.length) throw new Error(`missing audit actions: ${missing.join(", ")}`);
      return `${actions.size} distinct actions logged`;
    });

    // ------------------------------------------------------ final screenshots
    await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    writeFileSync(join(ARTIFACTS, "05-final-dashboard.png"), await page.screenshot({ type: "png", fullPage: false }));

    await check("server-rendered pages contain no unhandled errors", async () => {
      const res = await fetch(`${BASE}/login`);
      const html = await res.text();
      if (/Application error|Internal Server Error/i.test(html)) throw new Error("error page rendered");
      return `${html.length} bytes rendered`;
    });
  } finally {
    await browser.close().catch(() => undefined);
  }

  const report = {
    baseUrl: BASE,
    ranAt: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed,
    results,
  };
  writeFileSync(join(ARTIFACTS, "e2e-report.json"), JSON.stringify(report, null, 2));

  console.log(`${"-".repeat(58)}`);
  console.log(`${report.passed} passed, ${failed} failed — report: artifacts/e2e-report.json`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E harness crashed:", error);
  process.exit(1);
});
