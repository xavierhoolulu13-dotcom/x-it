import { ApprovalRejectedError, ApprovalTimeoutError } from "@/lib/tools/errors";

interface Waiter {
  resolve: (decision: "approved" | "rejected") => void;
  timer: NodeJS.Timeout;
}

/**
 * In-process registry for pending approvals.
 *
 * The agent loop awaits a decision while the UI (or the approvals API) resolves
 * it. Survives Next.js hot reloads via a global.
 */
class ApprovalBroker {
  private waiters = new Map<string, Waiter>();

  wait(approvalId: string, toolName: string, timeoutSeconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(approvalId);
        reject(new ApprovalTimeoutError(toolName, timeoutSeconds));
      }, timeoutSeconds * 1000);
      if (typeof timer.unref === "function") timer.unref();

      this.waiters.set(approvalId, {
        timer,
        resolve: (decision) => {
          clearTimeout(timer);
          this.waiters.delete(approvalId);
          if (decision === "approved") resolve();
          else reject(new ApprovalRejectedError(toolName));
        },
      });
    });
  }

  decide(approvalId: string, decision: "approved" | "rejected"): boolean {
    const waiter = this.waiters.get(approvalId);
    if (!waiter) return false;
    waiter.resolve(decision);
    return true;
  }

  pending(): string[] {
    return [...this.waiters.keys()];
  }

  cancelAll(): void {
    for (const [id, waiter] of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve("rejected");
      this.waiters.delete(id);
    }
  }
}

const globalForApprovals = globalThis as unknown as { __xitApprovalBroker?: ApprovalBroker };

export function getApprovalBroker(): ApprovalBroker {
  if (!globalForApprovals.__xitApprovalBroker) {
    globalForApprovals.__xitApprovalBroker = new ApprovalBroker();
  }
  return globalForApprovals.__xitApprovalBroker;
}
