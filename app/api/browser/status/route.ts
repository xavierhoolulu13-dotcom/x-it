import { NextRequest } from "next/server";
import { getBrowserEngine } from "@/lib/browser/engine";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const engine = getBrowserEngine();
    const status = await engine.isReady();
    const sessions = engine.listSessions();
    return ok({ ...status, sessions: sessions.length });
  });
}

/** Warm up Chromium so the first navigation is fast. */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const engine = getBrowserEngine();
    const status = await engine.isReady();
    return ok(status, { status: status.ready ? 200 : 503 });
  });
}
