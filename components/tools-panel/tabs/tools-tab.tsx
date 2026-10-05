"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/lib/stores/chat-store";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface ToolDefinition {
  name: string;
  description: string;
  permissionLevel: "read_only" | "approval_required" | "always_blocked";
}

interface RuntimeInfo {
  sandboxBackend: string;
  browserReady: boolean;
  chromiumSource: string | null;
  browserError: string | null;
}

interface ToolCallRecord {
  id: string;
  toolName: string;
  status: string;
  createdAt: string;
  duration?: number | null;
}

const PERMISSION_STYLE: Record<string, string> = {
  read_only: "bg-status-completed/15 text-status-completed",
  approval_required: "bg-status-waiting/15 text-status-waiting",
  always_blocked: "bg-destructive/15 text-destructive",
};

export function ToolsTab() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [history, setHistory] = useState<ToolCallRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, historyRes] = await Promise.all([
        fetch("/api/tools"),
        fetch(`/api/tools/history?limit=25${activeConversationId ? `&conversationId=${activeConversationId}` : ""}`),
      ]);
      if (toolsRes.ok) {
        const data = await toolsRes.json();
        setTools(data.tools || []);
        setRuntime(data.runtime || null);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.toolCalls || []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeConversationId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Tool system</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void load()}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {runtime && (
          <div className="mb-4 rounded-lg border border-border p-3 text-xs">
            <p className="mb-2 font-medium">Runtime</p>
            <div className="space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>Sandbox backend</span>
                <span className={runtime.sandboxBackend === "docker" ? "text-status-completed" : "text-status-waiting"}>
                  {runtime.sandboxBackend}
                  {runtime.sandboxBackend === "local" ? " (no isolation)" : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Chromium</span>
                <span className={runtime.browserReady ? "text-status-completed" : "text-destructive"}>
                  {runtime.browserReady ? `ready (${runtime.chromiumSource})` : "unavailable"}
                </span>
              </div>
            </div>
            {runtime.sandboxBackend === "local" && (
              <p className="mt-2 text-[10px] text-status-waiting">
                Docker was not reachable, so commands run in a workspace directory instead of a container. Build the
                sandbox image and install Docker for hard isolation.
              </p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium">Recent tool calls</p>
            <div className="space-y-1">
              {history.map((call) => (
                <div key={call.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      call.status === "COMPLETED"
                        ? "bg-status-completed"
                        : call.status === "FAILED" || call.status === "REJECTED"
                          ? "bg-status-failed"
                          : call.status === "RUNNING"
                            ? "bg-status-running animate-pulse"
                            : "bg-status-waiting"
                    }`}
                  />
                  <span className="font-medium">{call.toolName}</span>
                  <span className="ml-auto text-muted-foreground">
                    {call.duration ? `${call.duration}ms` : new Date(call.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mb-2 text-xs font-medium">Available tools ({tools.length})</p>
        <div className="space-y-1.5">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-medium">{tool.name}</span>
                <span
                  className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] uppercase ${PERMISSION_STYLE[tool.permissionLevel]}`}
                >
                  {tool.permissionLevel.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{tool.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ToolsTab;
