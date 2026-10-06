import { NextRequest } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(8000).optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const projects = store.listProjects(ctx.userId).map((p) => ({
      ...p,
      conversationCount: store.listConversations(p.id).length,
      sandboxCount: store.listSandboxRecords(ctx.userId).filter((s) => s.projectId === p.id).length,
    }));
    return ok({ projects });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const parsed = createSchema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("Invalid request", 400, { details: parsed.error.flatten() });

    const project = store.createProject({
      name: parsed.data.name,
      description: parsed.data.description,
      systemPrompt: parsed.data.systemPrompt,
      userId: ctx.userId,
    });

    let sandboxId: string | null = null;
    try {
      const sandbox = await getSandboxManager().ensure(ctx.userId, project.id);
      sandboxId = sandbox.id;
    } catch (error) {
      console.warn("[projects] sandbox not created:", error instanceof Error ? error.message : error);
    }

    store.addAuditLog({
      userId: ctx.userId,
      action: "project.create",
      resource: "project",
      resourceId: project.id,
      details: { name: project.name },
    });

    return ok({ project, sandboxId }, { status: 201 });
  });
}
