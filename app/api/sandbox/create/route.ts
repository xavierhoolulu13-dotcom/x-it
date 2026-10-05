import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const body = (await readJson<{ projectId?: string; recreate?: boolean }>(req)) || {};
    const project =
      (body.projectId ? store.getProject(body.projectId) : undefined) || store.listProjects(ctx.userId)[0];

    if (!project) return fail("No project available — create one first", 400);
    if (project.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const manager = getSandboxManager();

    if (body.recreate) {
      for (const record of store.listSandboxRecords(ctx.userId).filter((s) => s.projectId === project.id)) {
        const runtime = await manager.get(record.id);
        if (runtime) await manager.destroy(runtime);
      }
    }

    try {
      const runtime = await manager.ensure(ctx.userId, project.id);
      return ok(
        {
          sandbox: {
            id: runtime.id,
            projectId: project.id,
            backend: runtime.backend,
            status: runtime.status,
            workspaceDir: runtime.workspaceDir,
            port: runtime.port,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to create sandbox", 500);
    }
  });
}
