import { store, type ApprovalRecord } from "@/lib/db/store";
import { getApprovalBroker } from "@/lib/tools/approval-broker";

export interface DecisionResult {
  approval: ApprovalRecord;
  deliveredToWaitingAgent: boolean;
}

/**
 * Record an approval decision and wake the agent loop waiting on it.
 *
 * Both the REST routes and the agent runtime go through this function so the
 * stored status and the in-memory waiter can never disagree.
 */
export function decideApproval(
  approvalId: string,
  decision: "approve" | "reject",
  options: { userId?: string; reason?: string } = {}
): DecisionResult | null {
  const approval = store.getApproval(approvalId);
  if (!approval) return null;

  const approved = decision === "approve";
  store.updateApproval(approvalId, {
    status: approved ? "APPROVED" : "REJECTED",
    decidedAt: new Date().toISOString(),
  });

  const deliveredToWaitingAgent = getApprovalBroker().decide(
    approvalId,
    approved ? "approved" : "rejected"
  );

  if (options.userId) {
    store.addAuditLog({
      userId: options.userId,
      action: approved ? "approval.approved" : "approval.rejected",
      resource: "approval",
      resourceId: approvalId,
      details: {
        toolName: approval.toolName,
        arguments: approval.arguments,
        reason: options.reason,
        deliveredToWaitingAgent,
      },
    });
  }

  return { approval: store.getApproval(approvalId) as ApprovalRecord, deliveredToWaitingAgent };
}

export function pendingApprovalCount(userId: string): number {
  return store.listApprovals({ userId, status: "PENDING", limit: 500 }).length;
}
