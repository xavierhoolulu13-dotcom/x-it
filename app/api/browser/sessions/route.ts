import { NextRequest } from "next/server";
import { z } from "zod";
import { getBrowserEngine } from "@/lib/browser/engine";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().max(80).optional(),
  url: z.string().max(2000).optional(),
  viewport: z
    .object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
      deviceScaleFactor: z.number().min(0.5).max(4).optional(),
    })
    .optional(),
  sandboxId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const live = engine.listSessions(ctx.userId);
    const known = store.listBrowserSessions(ctx.userId).slice(0, 50);
    const sessions = live.length
      ? live
      : known.map((s) => ({
          id: s.id,
          name: s.name,
          url: s.url,
          title: "",
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          actionCount: 0,
          alive: false,
        }));
    return ok({ sessions, driver: await engine.isReady().catch(() => ({ ready: false, source: null, error: "unknown" })) });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const body = await readJson<unknown>(req);
    const parsed = createSchema.safeParse(body || {});
    if (!parsed.success) return fail("Invalid request", 400, { details: parsed.error.flatten() });

    const engine = getBrowserEngine();
    try {
      const state = await engine.createSession({
        userId: ctx.userId,
        name: parsed.data.name || "Browser session",
        url: parsed.data.url,
        viewport: parsed.data.viewport,
      });
      store.createBrowserSession({
        id: state.sessionId,
        userId: ctx.userId,
        name: parsed.data.name || "Browser session",
        url: state.url,
      });
      store.addAuditLog({
        userId: ctx.userId,
        action: "browser.session.create",
        resource: "browser_session",
        resourceId: state.sessionId,
        details: { url: state.url },
      });
      return ok({ state }, { status: 201 });
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Failed to start browser",
        503,
        { browserUnavailable: true }
      );
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const closed = await engine.closeAll(ctx.userId);
    return ok({ closed });
  });
}
