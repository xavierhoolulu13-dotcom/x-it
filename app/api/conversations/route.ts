import { NextRequest } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  projectId: z.string().min(1),
  modelId: z.string().max(120).optional(),
  systemPrompt: z.string().max(8000).optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const search = url.searchParams.get("search") || undefined;

    const conversations = projectId
      ? store.listConversations(projectId, { search }).filter((c) => c.userId === ctx.userId)
      : store.listConversationsByUser(ctx.userId).filter((c) => (search ? c.title.toLowerCase().includes(search.toLowerCase()) : true));

    return ok({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        projectId: c.projectId,
        modelId: c.modelId,
        temperature: c.temperature,
        maxTokens: c.maxTokens,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: store.listMessages(c.id).length,
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const parsed = createSchema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("Invalid request", 400, { details: parsed.error.flatten() });

    const project = store.getProject(parsed.data.projectId);
    if (!project || (project.userId !== ctx.userId && ctx.user.role !== "ADMIN")) {
      return fail("Project not found", 404);
    }

    const conversation = store.createConversation({
      title: parsed.data.title || "New conversation",
      projectId: project.id,
      userId: ctx.userId,
      modelId: parsed.data.modelId,
      systemPrompt: parsed.data.systemPrompt,
    });

    store.addAuditLog({
      userId: ctx.userId,
      action: "conversation.create",
      resource: "conversation",
      resourceId: conversation.id,
      details: { projectId: project.id },
    });

    return ok({ conversation }, { status: 201 });
  });
}
