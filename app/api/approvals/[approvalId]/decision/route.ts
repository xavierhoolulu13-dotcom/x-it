import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { decideApproval } from "@/lib/tools/approvals";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

/**
 * Decide a pending approval.
 *
 * POST /api/approvals/:id/decision { "decision": "approve" | "reject", "reason"?: string }
 * (also exposed as /approve and /reject)
 */
export async function POST(req: NextRequest, { params }: { params: { approvalId: string } }) {
  return withAuth(req, async (ctx) => {
    const approval = store.getApproval(params.approvalId);
    if (!approval) return fail("Approval not found", 404);
    if (approval.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);
    if (approval.status !== "PENDING") {
      return fail(`Approval already ${approval.status.toLowerCase()}`, 409);
    }

    const body = (await readJson<{ decision?: string; reason?: string }>(req)) || {};
    const raw = (body.decision || "").toLowerCase();
    const approve = ["approve", "approved", "accept", "yes", "true"].includes(raw);
    const reject = ["reject", "rejected", "deny", "no", "false"].includes(raw);
    if (!approve && !reject) return fail("decision must be 'approve' or 'reject'", 400);

    const result = decideApproval(params.approvalId, approve ? "approve" : "reject", {
      userId: ctx.userId,
      reason: body.reason,
    });

    return ok({ approval: result?.approval, deliveredToWaitingAgent: result?.deliveredToWaitingAgent });
  });
}

export async function GET(req: NextRequest, { params }: { params: { approvalId: string } }) {
  return withAuth(req, async (ctx) => {
    const approval = store.getApproval(params.approvalId);
    if (!approval) return fail("Approval not found", 404);
    if (approval.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);
    return ok({ approval });
  });
}
