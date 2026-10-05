import { NextRequest } from "next/server";
import { z } from "zod";
import { getBrowserEngine } from "@/lib/browser/engine";
import { fail, readJson, ok, withAuth } from "@/lib/util/api";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    selector: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    clickCount: z.number().int().min(1).max(3).optional(),
  }),
  z.object({
    type: z.literal("type"),
    selector: z.string().optional(),
    text: z.string().max(5000),
    delay: z.number().min(0).max(500).optional(),
    submit: z.boolean().optional(),
    clear: z.boolean().optional(),
  }),
  z.object({ type: z.literal("press"), key: z.string().min(1).max(40), selector: z.string().optional() }),
  z.object({ type: z.literal("scroll"), x: z.number().optional(), y: z.number().optional(), selector: z.string().optional() }),
  z.object({ type: z.literal("hover"), selector: z.string().min(1) }),
  z.object({ type: z.literal("select"), selector: z.string().min(1), value: z.string() }),
  z.object({ type: z.literal("wait"), selector: z.string().optional(), ms: z.number().int().min(0).max(30_000).optional() }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({ type: z.literal("reload") }),
  z.object({
    type: z.literal("setViewport"),
    viewport: z.object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(240).max(2160),
      deviceScaleFactor: z.number().min(0.5).max(4).optional(),
    }),
  }),
  z.object({ type: z.literal("focus"), selector: z.string().min(1) }),
]);

const requestSchema = z.object({ action: actionSchema });

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const body = await readJson<unknown>(req);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid browser action", 400, { details: parsed.error.flatten() });

    try {
      const state = await engine.act(params.sessionId, parsed.data.action);
      store.updateBrowserSession(params.sessionId, { url: state.url });
      store.addAuditLog({
        userId: ctx.userId,
        action: `browser.action.${parsed.data.action.type}`,
        resource: "browser_session",
        resourceId: params.sessionId,
        details: { detail: state.lastAction?.detail, ok: state.lastAction?.ok },
      });
      return ok({ state });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Browser action failed", 400);
    }
  });
}
