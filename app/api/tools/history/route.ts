import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);

    return ok({
      toolCalls: store.listToolCalls({ userId: ctx.userId, conversationId, limit }),
    });
  });
}
