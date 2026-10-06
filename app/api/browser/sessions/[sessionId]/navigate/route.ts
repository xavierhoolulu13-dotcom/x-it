import { NextRequest } from "next/server";
import { z } from "zod";
import { getBrowserEngine } from "@/lib/browser/engine";
import { fail, readJson, ok, withAuth } from "@/lib/util/api";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  url: z.string().min(1).max(2000),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const body = await readJson<unknown>(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("A valid url is required", 400);

    try {
      const state = await engine.navigate(params.sessionId, parsed.data.url, {
        waitUntil: parsed.data.waitUntil,
      });
      store.updateBrowserSession(params.sessionId, { url: state.url });
      store.addAuditLog({
        userId: ctx.userId,
        action: "browser.navigate",
        resource: "browser_session",
        resourceId: params.sessionId,
        details: { url: state.url, title: state.title },
      });
      return ok({ state });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Navigation failed", 400);
    }
  });
}
