"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  tool: "text-status-running",
  browser: "text-status-thinking",
  sandbox: "text-status-completed",
  auth: "text-status-waiting",
  approval: "text-status-waiting",
  file: "text-foreground",
  terminal: "text-status-running",
};

export function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit?limit=200");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const colorFor = (action: string) =>
    ACTION_COLORS[action.split(".")[0]] || ACTION_COLORS[action.split("_")[0]] || "text-foreground";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Audit log</span>
          <span className="text-[10px] text-muted-foreground">{logs.length} events</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void load()}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">📋</span>
            <p className="mt-3 text-sm font-medium">No audit events</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Every sign-in, tool call, approval and sandbox action is recorded here.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log) => (
              <button
                key={log.id}
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/50"
              >
                <div className="flex items-start gap-2">
                  <span className="whitespace-nowrap font-mono text-muted-foreground">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium ${colorFor(log.action)}`}>{log.action}</span>
                    <span className="text-muted-foreground"> · {log.resource}</span>
                    {expanded === log.id && (
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[10px]">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditTab;
