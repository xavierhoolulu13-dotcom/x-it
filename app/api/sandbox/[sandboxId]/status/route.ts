import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const files = await manager.listFiles(runtime, ".", 1).catch(() => []);

    return ok({
      sandbox: {
        id: runtime.id,
        projectId: runtime.record.projectId,
        backend: runtime.backend,
        status: runtime.status,
        workspaceDir: runtime.workspaceDir,
        port: runtime.port,
        createdAt: runtime.record.createdAt,
      },
      servers: manager.listServers(runtime),
      fileCount: files.length,
    });
  });
}
