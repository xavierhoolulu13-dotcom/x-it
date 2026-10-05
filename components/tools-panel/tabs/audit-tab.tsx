"use client";

import { useSandboxStore } from "@/lib/stores/sandbox-store";

export function AuditTab() {
  const { auditLogs } = useSandboxStore();

  if (auditLogs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <span className="text-4xl">📋</span>
        <p className="mt-3 text-sm font-medium">No audit events</p>
        <p className="mt-1 text-xs text-muted-foreground">
          All actions will be logged here for review and accountability.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-1">
        {auditLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 rounded-md px-3 py-2 text-xs hover:bg-accent/50"
          >
            <span className="mt-0.5 font-mono text-muted-foreground whitespace-nowrap">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <div className="flex-1">
              <span className="font-medium">{log.action}</span>
              <span className="text-muted-foreground"> · {log.resource}</span>
              {log.resourceId && (
                <span className="text-muted-foreground"> ({log.resourceId})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}