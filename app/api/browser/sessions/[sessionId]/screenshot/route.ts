import { NextRequest } from "next/server";
import { getBrowserEngine } from "@/lib/browser/engine";
import { fail, ok, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const body = (await readJson<{ fullPage?: boolean; format?: "png" | "jpeg"; quality?: number }>(req)) || {};
    try {
      const shot = await engine.screenshot(params.sessionId, body);
      return ok(shot);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Screenshot failed", 400);
    }
  });
}

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const url = new URL(req.url);
    const fullPage = url.searchParams.get("fullPage") === "1";
    const format = (url.searchParams.get("format") as "png" | "jpeg") || "png";

    try {
      const shot = await engine.screenshot(params.sessionId, { fullPage, format });
      const buffer = Buffer.from(shot.base64, "base64");
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": shot.format === "png" ? "image/png" : "image/jpeg",
          "Cache-Control": "no-store, max-age=0",
          "Content-Length": String(buffer.length),
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Screenshot failed", 400);
    }
  });
}
