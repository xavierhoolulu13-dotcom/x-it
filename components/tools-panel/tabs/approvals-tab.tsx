"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShieldCheck, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";

interface Approval {
  id: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  decidedAt?: string | null;
}

export function ApprovalsTab() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error(`Failed to load approvals (${res.status})`);
      const data = await res.json();
      setApprovals(data.approvals || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try {
      const res = await fetch(`/api/approvals/${id}/${decision}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Decision failed");
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  };

  const pending = approvals.filter((a) => a.status === "PENDING");
  const decided = approvals.filter((a) => a.status !== "PENDING").slice(0, 10);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-medium">Approvals</span>
          {pending.length > 0 && (
            <span className="rounded-full bg-status-waiting/20 px-2 py-0.5 text-[10px] text-status-waiting">
              {pending.length} pending
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void load()}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {approvals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">🛡️</span>
            <p className="mt-3 text-sm font-medium">No approvals yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sensitive tool calls (file writes, shell commands, browser actions) will queue here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...pending, ...decided].map((approval) => (
              <div
                key={approval.id}
                className={`rounded-lg border p-3 text-sm ${
                  approval.status === "PENDING" ? "border-status-waiting approval-glow" : "border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{approval.toolName}</span>
                  <span className="ml-auto text-[10px] uppercase text-muted-foreground">{approval.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[11px]">
                  {JSON.stringify(approval.arguments, null, 2)}
                </pre>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Requested {new Date(approval.createdAt).toLocaleTimeString()} · expires{" "}
                  {new Date(approval.expiresAt).toLocaleTimeString()}
                </p>

                {approval.status === "PENDING" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy === approval.id} onClick={() => decide(approval.id, "approve")}>
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === approval.id}
                      onClick={() => decide(approval.id, "reject")}
                    >
                      <XCircle className="mr-1 h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ApprovalsTab;
