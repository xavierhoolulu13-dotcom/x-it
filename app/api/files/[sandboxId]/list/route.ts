import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { store } from "@/lib/db/store";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const url = new URL(req.url);
    const path = url.searchParams.get("path") || ".";
    const maxDepth = Math.min(Number(url.searchParams.get("maxDepth") || 1), 4);

    const files = await manager.listFiles(runtime, path, maxDepth);
    return ok({
      files,
      path,
      sandboxId: runtime.id,
      backend: runtime.backend,
      workspaceDir: runtime.workspaceDir,
      servers: manager.listServers(runtime),
    });
  });
}

export async function POST(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const body = (await req.json().catch(() => ({}))) as { path?: string; maxDepth?: number };
    const files = await manager.listFiles(runtime, body.path || ".", body.maxDepth ?? 1);
    store.addAuditLog({
      userId: ctx.userId,
      action: "file.list",
      resource: "sandbox",
      resourceId: runtime.id,
      details: { path: body.path || "." },
    });
    return ok({ files, sandboxId: runtime.id });
  });
}
