"use client";

import { useChatStore } from "@/lib/stores/chat-store";

export function ToolsTab() {
  const { conversations, activeConversationId } = useChatStore();
  const activeConv = conversations.find((c) => c.id === activeConversationId);

  // Collect all tool calls from active conversation
  const toolCalls = activeConv?.messages.flatMap((m) => m.toolCalls || []) || [];
  const recentCalls = toolCalls.slice(-20).reverse();

  if (recentCalls.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <span className="text-4xl">🔧</span>
        <p className="mt-3 text-sm font-medium">No tool calls yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tool calls will appear here when the AI uses tools during your conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-2">
        {recentCalls.map((tc) => (
          <div
            key={tc.id}
            className="rounded-lg border border-border p-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  tc.status === "completed"
                    ? "bg-status-completed"
                    : tc.status === "failed"
                    ? "bg-status-failed"
                    : tc.status === "running"
                    ? "bg-status-running animate-pulse"
                    : "bg-status-waiting"
                }`}
              />
              <span className="font-medium">{tc.toolName}</span>
            </div>
            {tc.result && (
              <pre className="mt-2 max-h-20 overflow-auto rounded bg-muted/50 p-2 text-xs">
                {tc.result.slice(0, 200)}
                {tc.result.length > 200 && "..."}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}