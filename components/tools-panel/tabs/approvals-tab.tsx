"use client";

import { useSandboxStore } from "@/lib/stores/sandbox-store";
import { Button } from "@/components/ui/button";
import { Shield, Check, X, Clock } from "lucide-react";

export function ApprovalsTab() {
  const { pendingApprovals, updateApproval } = useSandboxStore();

  const pending = pendingApprovals.filter((a) => a.status === "pending");
  const decided = pendingApprovals.filter((a) => a.status !== "pending");

  const handleApprove = (id: string) => {
    updateApproval(id, { status: "approved", decidedAt: new Date() });
    // Also notify the backend
    fetch(`/api/tools/approve/${id}`, { method: "POST" }).catch(console.error);
  };

  const handleReject = (id: string) => {
    updateApproval(id, { status: "rejected", decidedAt: new Date() });
    fetch(`/api/tools/reject/${id}`, { method: "POST" }).catch(console.error);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Shield className="h-4 w-4" />
        <span className="text-sm font-medium">Approvals</span>
        {pending.length > 0 && (
          <span className="rounded-full bg-status-waiting px-2 py-0.5 text-xs font-medium text-white">
            {pending.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Pending */}
        {pending.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
              Pending ({pending.length})
            </h3>
            <div className="space-y-2">
              {pending.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-lg border border-status-waiting/30 bg-status-waiting/5 p-3"
                >
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 text-status-waiting" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{approval.toolName}</p>
                      <pre className="mt-1 text-xs text-muted-foreground">
                        {JSON.stringify(approval.arguments, null, 2)}
                      </pre>
                      {approval.reason && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {approval.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(approval.id)}
                      className="gap-1"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(approval.id)}
                      className="gap-1"
                    >
                      <X className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {decided.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
              History
            </h3>
            <div className="space-y-1">
              {decided.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                >
                  {approval.status === "approved" ? (
                    <Check className="h-3 w-3 text-status-completed" />
                  ) : (
                    <X className="h-3 w-3 text-destructive" />
                  )}
                  <span className="flex-1 truncate">{approval.toolName}</span>
                  <span className="text-muted-foreground">
                    {new Date(approval.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {pending.length === 0 && decided.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">🛡️</span>
            <p className="mt-3 text-sm font-medium">No pending approvals</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approval requests will appear here when the AI needs permission for actions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}