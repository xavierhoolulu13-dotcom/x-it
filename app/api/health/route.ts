import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    store.snapshot();
    checks.store = { ok: true, detail: `${store.snapshot().users.length} users` };
  } catch (error) {
    checks.store = { ok: false, detail: error instanceof Error ? error.message : "unknown" };
  }

  try {
    const manager = getSandboxManager();
    const backend = await manager.backendKind();
    checks.sandbox = { ok: true, detail: backend };
  } catch (error) {
    checks.sandbox = { ok: false, detail: error instanceof Error ? error.message : "unknown" };
  }

  const aiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL);
  checks.ai = {
    ok: true,
    detail: aiConfigured ? "configured" : "demo agent (no API key)",
  };

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: "3.0.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
