import { NextRequest } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  return withAuth(req, async (ctx) => {
    const project = store.getProject(params.projectId);
    if (!project) return fail("Project not found", 404);
    if (project.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    return ok({
      snapshots: store.listSnapshots(params.projectId).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        fileCount: s.files.length,
        files: s.files.map((f) => f.path),
        createdAt: s.createdAt,
      })),
    });
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  return withAuth(req, async (ctx) => {
    const project = store.getProject(params.projectId);
    if (!project) return fail("Project not found", 404);
    if (project.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const parsed = schema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("name is required", 400);

    const manager = getSandboxManager();
    const record = store.listSandboxRecords(ctx.userId).find((s) => s.projectId === params.projectId);
    const runtime = record ? await manager.get(record.id) : null;
    if (!runtime) return fail("No sandbox is available for this project", 409);

    const files = await manager.captureFiles(runtime);
    const snapshot = store.createSnapshot({
      projectId: params.projectId,
      name: parsed.data.name,
      description: parsed.data.description,
      files,
    });

    store.addAuditLog({
      userId: ctx.userId,
      action: "snapshot.create",
      resource: "snapshot",
      resourceId: snapshot.id,
      details: { projectId: params.projectId, fileCount: files.length },
    });

    return ok({ snapshot: { id: snapshot.id, name: snapshot.name, fileCount: files.length } }, { status: 201 });
  });
}
