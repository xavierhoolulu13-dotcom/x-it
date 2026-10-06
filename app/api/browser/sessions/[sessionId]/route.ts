import { NextRequest } from "next/server";
import { getBrowserEngine } from "@/lib/browser/engine";
import { ok, fail, withAuth } from "@/lib/util/api";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const url = new URL(req.url);
    const state = await engine.getState(params.sessionId, {
      screenshot: url.searchParams.get("screenshot") !== "0",
      elements: url.searchParams.get("elements") !== "0",
    });
    return ok({ state });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (session && session.userId !== ctx.userId && ctx.user.role !== "ADMIN") {
      return fail("Forbidden", 403);
    }
    const closed = await engine.close(params.sessionId);
    store.deleteBrowserSession(params.sessionId);
    store.addAuditLog({
      userId: ctx.userId,
      action: "browser.session.close",
      resource: "browser_session",
      resourceId: params.sessionId,
      details: { closed },
    });
    return ok({ closed });
  });
}
