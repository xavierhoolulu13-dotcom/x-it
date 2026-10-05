import { launch, type Browser, type BrowserContext, type Page } from "puppeteer-core";
import { chromiumEnv, resolveChromium } from "@/lib/browser/chromium";
import {
  ELEMENTS_SCRIPT,
  PAGE_LINKS_SCRIPT,
  PAGE_TEXT_SCRIPT,
  htmlToMarkdown,
} from "@/lib/browser/extract";
import type {
  BrowserAction,
  BrowserActionRecord,
  BrowserHistoryEntry,
  BrowserSessionSummary,
  BrowserViewport,
  InteractiveElement,
  PageState,
} from "@/lib/browser/types";
import { newId } from "@/lib/db/store";

const DEFAULT_VIEWPORT: BrowserViewport = { width: 1280, height: 800, deviceScaleFactor: 1 };
const MAX_ACTIONS = 200;
const IDLE_SHUTDOWN_MS = Number(process.env.BROWSER_IDLE_SHUTDOWN_MS || 5 * 60 * 1000);

interface EngineSession {
  id: string;
  userId: string;
  name: string;
  url: string;
  title: string;
  viewport: BrowserViewport;
  context: BrowserContext;
  page: Page;
  createdAt: string;
  updatedAt: string;
  history: BrowserHistoryEntry[];
  actions: BrowserActionRecord[];
  lastScreenshot?: { base64: string; format: "png" | "jpeg"; at: string };
}

export interface ScreenshotResult {
  base64: string;
  format: "png" | "jpeg";
  at: string;
}

/**
 * Real headless-browser automation.
 *
 * One Chromium process serves many isolated sessions (one BrowserContext each),
 * so cookies and storage never leak between conversations.
 */
export class BrowserEngine {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sessions = new Map<string, EngineSession>();
  private idleTimer: NodeJS.Timeout | null = null;
  private lastActivity = Date.now();
  private chromiumSource: string | null = null;
  private chromiumError: string | null = null;

  // ------------------------------------------------------------------ lifecycle
  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      const descriptor = await resolveChromium();
      this.chromiumSource = descriptor.source;
      const browser = await launch({
        executablePath: descriptor.executablePath,
        headless: true,
        env: chromiumEnv(descriptor),
        args: dedupeArgs([
          ...(descriptor.args || []),
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-features=Translate,MediaRouter,OptimizationHints",
          "--mute-audio",
          "--window-size=1280,800",
        ]),
        defaultViewport: DEFAULT_VIEWPORT,
      });
      this.browser = browser;
      browser.on("disconnected", () => {
        this.browser = null;
        this.sessions.clear();
      });
      return browser;
    })();

    try {
      return await this.launching;
    } catch (error) {
      this.chromiumError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.launching = null;
    }
  }

  async isReady(): Promise<{ ready: boolean; source: string | null; error: string | null }> {
    try {
      await this.getBrowser();
      return { ready: true, source: this.chromiumSource, error: null };
    } catch (error) {
      return {
        ready: false,
        source: this.chromiumSource,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private touch(): void {
    this.lastActivity = Date.now();
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      if (this.sessions.size === 0 && Date.now() - this.lastActivity > IDLE_SHUTDOWN_MS) {
        void this.shutdown();
      }
    }, 30_000);
    if (typeof this.idleTimer.unref === "function") this.idleTimer.unref();
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    for (const session of this.sessions.values()) {
      await session.context.close().catch(() => undefined);
    }
    this.sessions.clear();
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  // ------------------------------------------------------------------ sessions
  async createSession(options: {
    userId: string;
    name?: string;
    url?: string;
    viewport?: BrowserViewport;
  }): Promise<PageState> {
    const browser = await this.getBrowser();
    const viewport = { ...DEFAULT_VIEWPORT, ...(options.viewport || {}) };
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewport);
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(30_000);

    const now = new Date().toISOString();
    const session: EngineSession = {
      id: newId("brs"),
      userId: options.userId,
      name: options.name || "Browser session",
      url: "about:blank",
      title: "",
      viewport,
      context,
      page,
      createdAt: now,
      updatedAt: now,
      history: [],
      actions: [],
    };
    this.sessions.set(session.id, session);
    this.touch();

    const target = options.url?.trim();
    if (target) {
      await this.navigate(session.id, target);
    } else {
      await page.goto("about:blank");
    }

    return this.getState(session.id, { screenshot: Boolean(target) });
  }

  getSession(id: string): { id: string; userId: string; name: string } | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    return { id: session.id, userId: session.userId, name: session.name };
  }

  private require(id: string): EngineSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Browser session ${id} not found or already closed`);
    return session;
  }

  listSessions(userId?: string): BrowserSessionSummary[] {
    return [...this.sessions.values()]
      .filter((s) => (userId ? s.userId === userId : true))
      .map((s) => ({
        id: s.id,
        name: s.name,
        url: safeUrl(s.page),
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        actionCount: s.actions.length,
        alive: !s.page.isClosed(),
      }));
  }

  async close(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    await session.context.close().catch(() => undefined);
    this.sessions.delete(id);
    return true;
  }

  async closeAll(userId?: string): Promise<number> {
    const ids = [...this.sessions.values()]
      .filter((s) => (userId ? s.userId === userId : true))
      .map((s) => s.id);
    for (const id of ids) await this.close(id);
    return ids.length;
  }

  // ------------------------------------------------------------------ actions
  async navigate(id: string, rawUrl: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2"; timeoutMs?: number })
    : Promise<PageState> {
    const session = this.require(id);
    const url = normalizeUrl(rawUrl);
    const started = Date.now();
    try {
      const response = await session.page.goto(url, {
        waitUntil: options?.waitUntil || "domcontentloaded",
        timeout: options?.timeoutMs || 30_000,
      });
      const status = response ? `HTTP ${response.status()}` : "no response";
      this.record(session, "navigate", `${url} (${status})`, true);
    } catch (error) {
      this.record(session, "navigate", url, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
    session.url = safeUrl(session.page);
    session.title = await readTitle(session.page);
    session.history.push({ url: session.url, title: session.title, at: new Date().toISOString() });
    if (session.history.length > 100) session.history.shift();
    session.updatedAt = new Date().toISOString();
    this.touch();
    void started;
    return this.getState(id, { screenshot: true });
  }

  async act(id: string, action: BrowserAction): Promise<PageState> {
    const session = this.require(id);
    const page = session.page;

    try {
      switch (action.type) {
        case "click": {
          if (action.selector) {
            await page.waitForSelector(action.selector, { timeout: 10_000 });
            await page.click(action.selector, {
              button: action.button || "left",
              count: action.clickCount || 1,
            });
            this.record(session, "click", action.selector, true);
          } else if (typeof action.x === "number" && typeof action.y === "number") {
            await page.mouse.click(action.x, action.y, { button: action.button || "left" });
            this.record(session, "click", `(${action.x}, ${action.y})`, true);
          } else {
            throw new Error("click requires a selector or x/y coordinates");
          }
          await settle(page);
          break;
        }
        case "type": {
          if (action.clear !== false && action.selector) {
            await page.waitForSelector(action.selector, { timeout: 10_000 });
            await page.click(action.selector, { count: 3 }).catch(() => undefined);
            await page.$eval(action.selector, (el) => {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = "";
            }).catch(() => undefined);
          }
          if (action.selector) await page.waitForSelector(action.selector, { timeout: 10_000 });
          await page.keyboard.type(action.text, { delay: action.delay ?? 12 });
          if (action.submit) {
            await page.keyboard.press("Enter");
            await settle(page);
          }
          this.record(session, "type", `${action.selector || "focused element"} ← "${truncate(action.text, 60)}"`, true);
          break;
        }
        case "press": {
          if (action.selector) await page.focus(action.selector);
          await page.keyboard.press(action.key as never);
          await settle(page);
          this.record(session, "press", action.key, true);
          break;
        }
        case "scroll": {
          if (action.selector) {
            await page.$eval(action.selector, (el) => el.scrollIntoView({ block: "center" }));
          } else {
            await page.evaluate(
              (dy: number) => window.scrollBy(0, dy),
              action.y ?? 600
            );
            if (action.x) await page.evaluate((dx: number) => window.scrollBy(dx, 0), action.x);
          }
          this.record(session, "scroll", action.selector || `y=${action.y ?? 600}`, true);
          break;
        }
        case "hover": {
          await page.waitForSelector(action.selector, { timeout: 10_000 });
          await page.hover(action.selector);
          this.record(session, "hover", action.selector, true);
          break;
        }
        case "select": {
          await page.waitForSelector(action.selector, { timeout: 10_000 });
          await page.select(action.selector, action.value);
          this.record(session, "select", `${action.selector} → ${action.value}`, true);
          break;
        }
        case "wait": {
          if (action.selector) await page.waitForSelector(action.selector, { timeout: 20_000 });
          if (action.ms) await new Promise((r) => setTimeout(r, Math.min(action.ms || 0, 30_000)));
          this.record(session, "wait", action.selector || `${action.ms}ms`, true);
          break;
        }
        case "back": {
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
          this.record(session, "back", "", true);
          break;
        }
        case "forward": {
          await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => null);
          this.record(session, "forward", "", true);
          break;
        }
        case "reload": {
          await page.reload({ waitUntil: "domcontentloaded" });
          this.record(session, "reload", "", true);
          break;
        }
        case "setViewport": {
          session.viewport = { ...session.viewport, ...action.viewport };
          await page.setViewport(session.viewport);
          this.record(session, "setViewport", `${session.viewport.width}x${session.viewport.height}`, true);
          break;
        }
        case "focus": {
          await page.waitForSelector(action.selector, { timeout: 10_000 });
          await page.focus(action.selector);
          this.record(session, "focus", action.selector, true);
          break;
        }
        default:
          throw new Error(`Unsupported browser action: ${JSON.stringify(action)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record(session, action.type, JSON.stringify(action).slice(0, 120), false, message);
      throw error;
    }

    session.url = safeUrl(page);
    session.title = await readTitle(page);
    session.updatedAt = new Date().toISOString();
    this.touch();
    return this.getState(id, { screenshot: true });
  }

  async screenshot(id: string, options?: { fullPage?: boolean; format?: "png" | "jpeg"; quality?: number })
    : Promise<ScreenshotResult> {
    const session = this.require(id);
    const format = options?.format || "png";
    const base64 = (await session.page.screenshot({
      encoding: "base64",
      fullPage: options?.fullPage ?? false,
      type: format,
      quality: format === "jpeg" ? options?.quality ?? 70 : undefined,
      captureBeyondViewport: options?.fullPage ?? false,
    })) as string;
    const at = new Date().toISOString();
    session.lastScreenshot = { base64, format, at };
    this.touch();
    return { base64, format, at };
  }

  async getState(id: string, options?: { screenshot?: boolean; elements?: boolean }): Promise<PageState> {
    const session = this.require(id);
    const page = session.page;
    if (page.isClosed()) throw new Error("Browser page is closed");

    let screenshot = session.lastScreenshot?.base64;
    let format = session.lastScreenshot?.format;

    if (options?.screenshot) {
      const shot = await this.screenshot(id);
      screenshot = shot.base64;
      format = shot.format;
    }

    const elements = options?.elements === false ? [] : await this.elements(id);

    session.url = safeUrl(page);
    session.title = await readTitle(page);

    return {
      sessionId: session.id,
      url: session.url,
      title: session.title,
      viewport: session.viewport,
      canGoBack: !page.isClosed(),
      canGoForward: !page.isClosed(),
      isLoading: false,
      elements,
      actionCount: session.actions.length,
      lastAction: session.actions[session.actions.length - 1],
      screenshot,
      screenshotFormat: format,
    };
  }

  async elements(id: string): Promise<InteractiveElement[]> {
    const session = this.require(id);
    try {
      const elements = (await session.page.evaluate(ELEMENTS_SCRIPT)) as InteractiveElement[];
      return Array.isArray(elements) ? elements : [];
    } catch {
      return [];
    }
  }

  async content(
    id: string,
    format: "html" | "text" | "markdown" | "links" = "markdown"
  ): Promise<{ format: string; content: string; url: string; title: string }> {
    const session = this.require(id);
    const page = session.page;
    let content = "";

    if (format === "html") {
      content = await page.content();
    } else if (format === "text") {
      content = (await page.evaluate(PAGE_TEXT_SCRIPT)) as string;
    } else if (format === "links") {
      const links = (await page.evaluate(PAGE_LINKS_SCRIPT)) as { href: string; text: string }[];
      content = links.map((l) => `- [${l.text || l.href}](${l.href})`).join("\n");
    } else {
      const html = await page.content();
      content = htmlToMarkdown(html);
    }

    this.record(session, `extract:${format}`, "", true);
    this.touch();
    session.url = safeUrl(page);
    session.title = await readTitle(page);

    return {
      format,
      content: content.slice(0, 200_000),
      url: session.url,
      title: session.title,
    };
  }

  async evaluate(id: string, script: string): Promise<unknown> {
    const session = this.require(id);
    const result = await session.page.evaluate((code: string) => {
      try {
        // eslint-disable-next-line no-new-func
        return new Function(`return (${code})`)();
      } catch {
        // eslint-disable-next-line no-eval
        return eval(code);
      }
    }, script);
    this.record(session, "evaluate", truncate(script, 80), true);
    return result;
  }

  async cookies(id: string): Promise<{ name: string; domain: string; value: string }[]> {
    const session = this.require(id);
    const cookies = await session.page.cookies();
    return cookies.map((c) => ({ name: c.name, domain: c.domain, value: c.value.slice(0, 12) + "…" }));
  }

  private record(session: EngineSession, type: string, detail: string, ok: boolean, error?: string): void {
    const entry: BrowserActionRecord = {
      id: newId("act"),
      type,
      detail: truncate(detail, 200),
      at: new Date().toISOString(),
      ok,
      error,
    };
    session.actions.push(entry);
    if (session.actions.length > MAX_ACTIONS) session.actions.shift();
    session.updatedAt = entry.at;
  }
}

function safeUrl(page: Page): string {
  try {
    return page.url();
  } catch {
    return "about:blank";
  }
}

async function readTitle(page: Page): Promise<string> {
  try {
    if (page.isClosed()) return "";
    return (await page.title()) || "";
  } catch {
    return "";
  }
}

/**
 * Chromium flags the bundled serverless build ships that we deliberately drop:
 *  - `--single-process`  : crashes when a second browser context/target is created
 *  - `--disable-web-security` / `--allow-running-insecure-content`
 *                        : unnecessary here and weaken in-page isolation
 */
const BLOCKED_FLAGS = new Set(["--single-process", "--disable-web-security", "--allow-running-insecure-content"]);

function dedupeArgs(args: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arg of args) {
    const key = arg.split("=")[0];
    if (BLOCKED_FLAGS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(arg);
  }
  return out;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function settle(page: Page): Promise<void> {
  await page
    .waitForNetworkIdle({ idleTime: 400, timeout: 4000 })
    .catch(() => undefined);
}

/** Normalize user input into a safe, absolute http(s) URL. */
export function normalizeUrl(raw: string): string {
  const input = raw.trim();
  if (!input) throw new Error("A URL is required");
  if (/^about:blank$/i.test(input)) return "about:blank";

  // Reject dangerous schemes (file:, javascript:, data:, chrome:, …) before we
  // ever consider prepending a default protocol. "localhost:3000" is a host and
  // port, not a scheme, so bare host:port inputs are still accepted.
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(input);
  if (schemeMatch) {
    const hasProtocolSlashes = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input);
    const looksLikeHostPort = /^[a-zA-Z0-9.-]+:\d+(\/|$)/.test(input);
    if (!hasProtocolSlashes && !looksLikeHostPort) {
      throw new Error(
        `Blocked URL scheme '${schemeMatch[1].toLowerCase()}:' — only http and https are allowed`
      );
    }
  }

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)
    ? input
    : /^localhost([:/]|$)/i.test(input) || /^127\.0\.0\.1([:/]|$)/.test(input)
      ? `http://${input}`
      : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  const allowed = ["http:", "https:"];
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(`Blocked URL scheme '${parsed.protocol}' — only http and https are allowed`);
  }

  // Private network guard: allow loopback (the sandbox preview) but not
  // arbitrary internal addresses, which would be an SSRF vector.
  const host = parsed.hostname;
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
  const isPrivate =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith(".internal");

  if (isPrivate && !isLoopback && process.env.X_IT_ALLOW_PRIVATE_NETWORK !== "true") {
    throw new Error(`Blocked request to private address '${host}' (SSRF protection)`);
  }

  return parsed.toString();
}

const globalForBrowser = globalThis as unknown as { __xitBrowserEngine?: BrowserEngine };

export function getBrowserEngine(): BrowserEngine {
  if (!globalForBrowser.__xitBrowserEngine) {
    globalForBrowser.__xitBrowserEngine = new BrowserEngine();
  }
  return globalForBrowser.__xitBrowserEngine;
}
