import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { getBrowserEngine, normalizeUrl } from "@/lib/browser/engine";
import { resolveChromium } from "@/lib/browser/chromium";

/**
 * These are real browser tests: they launch the same headless Chromium the app
 * uses and drive a local HTTP fixture. They are skipped (not failed) when no
 * Chromium binary is available on the host.
 */

let chromiumAvailable = false;
try {
  const descriptor = await resolveChromium();
  chromiumAvailable = Boolean(descriptor.executablePath);
} catch {
  chromiumAvailable = false;
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<!DOCTYPE html>
        <html><head><title>Browser Fixture</title></head>
        <body>
          <h1 id="heading">X-IT browser fixture</h1>
          <a href="/second">Go to second page</a>
          <form>
            <input id="name" name="name" placeholder="Your name" />
            <button id="submit" type="button">Submit</button>
          </form>
          <p id="echo"></p>
          <div style="height:2000px"></div>
        </body></html>`);
      return;
    }
    if (req.url === "/second") {
      res.setHeader("Content-Type", "text/html");
      res.end("<html><head><title>Second Page</title></head><body><h1>Second page</h1></body></html>");
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await getBrowserEngine().shutdown();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("url normalization / SSRF guard", () => {
  it("adds https to bare domains", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
  });

  it("keeps loopback http (sandbox previews)", () => {
    expect(normalizeUrl("localhost:3000/chat")).toBe("http://localhost:3000/chat");
    expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080/");
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(/scheme/i);
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/scheme/i);
  });

  it("blocks private network addresses", () => {
    expect(() => normalizeUrl("http://10.0.0.5/admin")).toThrow(/private/i);
    expect(() => normalizeUrl("http://169.254.169.254/latest/meta-data")).toThrow(/private/i);
    expect(() => normalizeUrl("http://192.168.1.1/")).toThrow(/private/i);
  });
});

describe.skipIf(!chromiumAvailable)("browser engine (real Chromium)", () => {
  it("creates a session, navigates and extracts content", async () => {
    const engine = getBrowserEngine();
    const state = await engine.createSession({ userId: "browser-test-user", url: baseUrl });
    expect(state.sessionId).toBeTruthy();
    expect(state.title).toBe("Browser Fixture");
    expect(state.screenshot && state.screenshot.length).toBeGreaterThan(1000);

    const content = await engine.content(state.sessionId, "markdown");
    expect(content.content).toContain("X-IT browser fixture");

    const links = await engine.content(state.sessionId, "links");
    expect(links.content).toContain("/second");

    const elements = await engine.elements(state.sessionId);
    expect(elements.some((e) => e.selector.includes("#name"))).toBe(true);
  });

  it("clicks, types and navigates back", async () => {
    const engine = getBrowserEngine();
    const state = await engine.createSession({ userId: "browser-test-user", url: `${baseUrl}/` });

    const typed = await engine.act(state.sessionId, { type: "type", selector: "#name", text: "Ada" });
    expect(typed.lastAction?.ok).toBe(true);

    const navigated = await engine.navigate(state.sessionId, `${baseUrl}/second`);
    expect(navigated.title).toBe("Second Page");

    const back = await engine.act(state.sessionId, { type: "back" });
    expect(back.title).toBe("Browser Fixture");

    const focused = await engine.act(state.sessionId, { type: "focus", selector: "#name" });
    expect(focused.lastAction?.ok).toBe(true);

    await engine.close(state.sessionId);
  });

  it("keeps sessions isolated from each other", async () => {
    const engine = getBrowserEngine();
    const a = await engine.createSession({ userId: "user-a", url: baseUrl });
    const b = await engine.createSession({ userId: "user-b", url: baseUrl });

    const sessionsA = engine.listSessions("user-a").map((s) => s.id);
    expect(sessionsA).toContain(a.sessionId);
    expect(sessionsA).not.toContain(b.sessionId);

    await engine.close(a.sessionId);
    await engine.close(b.sessionId);
    expect(engine.getSession(a.sessionId)).toBeNull();
  });

  it("captures full-page screenshots and supports viewport changes", async () => {
    const engine = getBrowserEngine();
    const state = await engine.createSession({ userId: "browser-test-user", url: baseUrl });

    const viewport = await engine.act(state.sessionId, {
      type: "setViewport",
      viewport: { width: 390, height: 844 },
    });
    expect(viewport.viewport.width).toBe(390);

    const shot = await engine.screenshot(state.sessionId, { fullPage: true });
    expect(shot.base64.length).toBeGreaterThan(1000);

    await engine.close(state.sessionId);
  });

  it("records an action log and refuses unknown sessions", async () => {
    const engine = getBrowserEngine();
    const state = await engine.createSession({ userId: "browser-test-user", url: baseUrl });
    await engine.navigate(state.sessionId, `${baseUrl}/second`);
    const after = await engine.getState(state.sessionId, { screenshot: false, elements: false });
    expect(after.actionCount).toBeGreaterThan(0);

    await expect(engine.navigate("does-not-exist", baseUrl)).rejects.toThrow(/not found/i);
    await engine.close(state.sessionId);
  });
});
