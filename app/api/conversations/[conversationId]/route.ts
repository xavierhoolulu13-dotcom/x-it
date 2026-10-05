import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { NextResponse } from "next/server";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

type AuthResult =
  | { denied: NextResponse; conversation?: undefined }
  | { denied?: undefined; conversation: NonNullable<ReturnType<typeof store.getConversation>> };

function authorize(conversationId: string, userId: string, role: string): AuthResult {
  const conversation = store.getConversation(conversationId);
  if (!conversation) return { denied: fail("Conversation not found", 404) };
  if (conversation.userId !== userId && role !== "ADMIN") return { denied: fail("Forbidden", 403) };
  return { conversation };
}

export async function GET(req: NextRequest, { params }: { params: { conversationId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.conversationId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    const messages = store.listMessages(params.conversationId).map((m) => ({
      ...m,
      toolCalls: store
        .listToolCalls({ conversationId: params.conversationId, limit: 200 })
        .filter((t) => t.messageId === m.id),
    }));

    return ok({ conversation: result.conversation, messages });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { conversationId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.conversationId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    const body = (await readJson<{ title?: string; modelId?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }>(req)) || {};
    const updated = store.updateConversation(params.conversationId, {
      ...(body.title ? { title: body.title.slice(0, 200) } : {}),
      ...(body.modelId ? { modelId: body.modelId } : {}),
      ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
      ...(typeof body.maxTokens === "number" ? { maxTokens: body.maxTokens } : {}),
      ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
    });
    return ok({ conversation: updated });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { conversationId: string } }) {
  return withAuth(req, async (ctx) => {
    const result = authorize(params.conversationId, ctx.userId, ctx.user.role);
    if (result.denied) return result.denied;

    store.deleteConversation(params.conversationId);
    store.addAuditLog({
      userId: ctx.userId,
      action: "conversation.delete",
      resource: "conversation",
      resourceId: params.conversationId,
      details: {},
    });
    return ok({ deleted: true });
  });
}
