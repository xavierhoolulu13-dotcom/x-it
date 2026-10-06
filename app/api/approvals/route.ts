import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    store.expireStaleApprovals();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null;

    const approvals = store.listApprovals({
      userId: ctx.userId,
      status: status || undefined,
      limit: 100,
    });

    return ok({
      approvals: approvals.map((a) => ({
        ...a,
        toolCall: store.listToolCalls({ limit: 1, userId: ctx.userId }).find((t) => t.id === a.toolCallId) || null,
      })),
      pending: approvals.filter((a) => a.status === "PENDING").length,
    });
  });
}
