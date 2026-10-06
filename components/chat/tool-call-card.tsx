"use client";

import { type UiToolCall } from "@/lib/stores/chat-store";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  Shield,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ToolCallCardProps {
  toolCall: UiToolCall;
  onDecided?: (toolCallId: string, decision: "approved" | "rejected") => void;
}

const TOOL_ICONS: Record<string, string> = {
  file_read: "📄",
  file_write: "✏️",
  file_delete: "🗑️",
  file_list: "📁",
  terminal_exec: "💻",
  code_run: "▶️",
  browser_navigate: "🌐",
  browser_action: "🖱️",
  browser_screenshot: "📸",
  browser_extract: "🧲",
  browser_close: "🚪",
  package_install: "📦",
  server_start: "🚀",
  server_stop: "⏹️",
  search_web: "🔍",
  snapshot_create: "🧷",
};

export function ToolCallCard({ toolCall, onDecided }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(toolCall.status !== "completed");
  const [deciding, setDeciding] = useState(false);

  const needsApproval = toolCall.status === "waiting_approval" && Boolean(toolCall.approvalId);

  const statusIcon = {
    pending: <Clock className="h-4 w-4 text-status-waiting" />,
    waiting_approval: <Shield className="h-4 w-4 text-status-waiting" />,
    running: <Loader2 className="h-4 w-4 animate-spin text-status-running" />,
    completed: <CheckCircle2 className="h-4 w-4 text-status-completed" />,
    failed: <XCircle className="h-4 w-4 text-status-failed" />,
    rejected: <Ban className="h-4 w-4 text-destructive" />,
  }[toolCall.status];

  async function decide(decision: "approve" | "reject") {
    if (!toolCall.approvalId) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/approvals/${toolCall.approvalId}/${decision}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to ${decision}`);
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      onDecided?.(toolCall.id, decision === "approve" ? "approved" : "rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div
      className={`rounded-lg border text-sm ${
        needsApproval
          ? "border-status-waiting approval-glow"
          : toolCall.status === "failed"
            ? "border-destructive/30"
            : "border-border"
      } bg-card`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-base">{TOOL_ICONS[toolCall.toolName] || "🔧"}</span>
        <span className="flex-1 font-medium">{toolCall.toolName}</span>
        {toolCall.durationMs ? (
          <span className="text-[10px] text-muted-foreground">{toolCall.durationMs}ms</span>
        ) : null}
        {statusIcon}
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {toolCall.reason && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Reason</span>
              <p className="mt-1 text-sm">{toolCall.reason}</p>
            </div>
          )}

          {Object.keys(toolCall.arguments || {}).length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Arguments</span>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          {toolCall.output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Result</span>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                {toolCall.output}
              </pre>
            </div>
          )}

          {toolCall.error && (
            <div>
              <span className="text-xs font-medium text-destructive">Error</span>
              <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                {toolCall.error}
              </pre>
            </div>
          )}

          {toolCall.screenshot && (
            <div>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> Screenshot
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/${toolCall.screenshotFormat || "png"};base64,${toolCall.screenshot}`}
                alt="Browser screenshot captured by the agent"
                className="mt-1 w-full rounded-md border border-border"
              />
            </div>
          )}

          {toolCall.previewUrl && (
            <a
              href={toolCall.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open live preview
            </a>
          )}

          {needsApproval && (
            <div className="flex items-center gap-2 rounded-md bg-status-waiting/10 p-3">
              <Shield className="h-4 w-4 text-status-waiting" />
              <span className="flex-1 text-sm">This action needs your approval</span>
              <Button size="sm" disabled={deciding} onClick={() => decide("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={deciding} onClick={() => decide("reject")}>
                Reject
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCallCard;
