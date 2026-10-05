import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

type ProjectAuthResult =
  | { denied: NextResponse; project?: undefined }
  | { denied?: undefined; project: NonNullable<ReturnType<typeof store.getProject>> };

function authorize(projectId: string, userId: string, role: string): ProjectAuthResult {
  const project = store.getProject(projectId);
  if (!project) return { denied: fail("Project not found", 404) };
  if (project.userId !== userId && role !== "ADMIN") return { denied: fail("Forbidden", 403) };
  return { project };
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.projectId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    const sandboxes = store
      .listSandboxRecords(ctx.userId)
      .filter((s) => s.projectId === params.projectId);
    const runtime = sandboxes[0] ? await getSandboxManager().get(sandboxes[0].id) : null;
    const servers = runtime ? getSandboxManager().listServers(runtime) : [];

    return ok({
      project: result.project,
      conversations: store.listConversations(params.projectId),
      sandboxes,
      servers,
      snapshots: store.listSnapshots(params.projectId).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        fileCount: s.files.length,
        createdAt: s.createdAt,
      })),
    });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.projectId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    const body = (await readJson<{ name?: string; description?: string; systemPrompt?: string }>(req)) || {};
    const updated = store.updateProject(params.projectId, {
      ...(body.name ? { name: body.name.slice(0, 120) } : {}),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
    });
    return ok({ project: updated });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.projectId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    for (const record of store.listSandboxRecords(ctx.userId).filter((s) => s.projectId === params.projectId)) {
      const runtime = await getSandboxManager().get(record.id);
      if (runtime) await getSandboxManager().destroy(runtime);
    }
    store.deleteProject(params.projectId);
    store.addAuditLog({
      userId: ctx.userId,
      action: "project.delete",
      resource: "project",
      resourceId: params.projectId,
      details: {},
    });
    return ok({ deleted: true });
  });
}
