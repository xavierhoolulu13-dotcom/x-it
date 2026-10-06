import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; snapshotId: string } }
) {
  return withAuth(req, async (ctx) => {
    const project = store.getProject(params.projectId);
    if (!project) return fail("Project not found", 404);
    if (project.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const snapshot = store.getSnapshot(params.snapshotId);
    if (!snapshot || snapshot.projectId !== params.projectId) return fail("Snapshot not found", 404);

    const manager = getSandboxManager();
    const record = store.listSandboxRecords(ctx.userId).find((s) => s.projectId === params.projectId);
    const runtime = record ? await manager.get(record.id) : null;
    if (!runtime) return fail("No sandbox is available for this project", 409);

    // Safety net: snapshot the current state before overwriting it.
    const current = await manager.captureFiles(runtime);
    store.createSnapshot({
      projectId: params.projectId,
      name: `Pre-restore backup (${new Date().toISOString()})`,
      description: `Automatically captured before restoring "${snapshot.name}"`,
      files: current,
    });

    await manager.restoreFiles(runtime, snapshot.files);

    store.addAuditLog({
      userId: ctx.userId,
      action: "snapshot.restore",
      resource: "snapshot",
      resourceId: snapshot.id,
      details: { fileCount: snapshot.files.length },
    });

    return ok({ restored: true, fileCount: snapshot.files.length, backupFileCount: current.length });
  });
}
