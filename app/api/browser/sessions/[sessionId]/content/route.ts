import { NextRequest } from "next/server";
import { getBrowserEngine } from "@/lib/browser/engine";
import { fail, ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  return withAuth(req, async (ctx) => {
    const engine = getBrowserEngine();
    const session = engine.getSession(params.sessionId);
    if (!session) return fail("Browser session not found", 404);
    if (session.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") as "html" | "text" | "markdown" | "links") || "markdown";
    if (!["html", "text", "markdown", "links"].includes(format)) {
      return fail("format must be one of html, text, markdown, links", 400);
    }

    try {
      return ok(await engine.content(params.sessionId, format));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Extraction failed", 400);
    }
  });
}
