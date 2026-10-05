import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { decideApproval } from "@/lib/tools/approvals";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { approvalId: string } }) {
  return withAuth(req, async (ctx) => {
    const approval = store.getApproval(params.approvalId);
    if (!approval) return fail("Approval not found", 404);
    if (approval.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);
    if (approval.status !== "PENDING") return fail(`Approval already ${approval.status.toLowerCase()}`, 409);

    const result = decideApproval(params.approvalId, "reject", { userId: ctx.userId });
    return ok({
      approval: result?.approval,
      deliveredToWaitingAgent: result?.deliveredToWaitingAgent ?? false,
    });
  });
}
