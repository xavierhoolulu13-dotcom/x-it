"use client";

import { type ToolCall } from "@/lib/stores/chat-store";
import { useSandboxStore } from "@/lib/stores/sandbox-store";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  Shield,
} from "lucide-react";
import { useState } from "react";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const TOOL_ICONS: Record<string, string> = {
  file_read: "📄",
  file_write: "✏️",
  file_delete: "🗑️",
  file_list: "📁",
  terminal_exec: "💻",
  code_run: "▶️",
  browser_navigate: "🌐",
  browser_screenshot: "📸",
  package_install: "📦",
  server_start: "🚀",
  server_stop: "⏹️",
  search_web: "🔍",
  screenshot_desktop: "🖥️",
};

const STATUS_ICONS = {
  pending: <Clock className="h-4 w-4 text-status-waiting" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-status-running" />,
  completed: <CheckCircle2 className="h-4 w-4 text-status-completed" />,
  failed: <XCircle className="h-4 w-4 text-status-failed" />,
  cancelled: <Ban className="h-4 w-4 text-muted-foreground" />,
  rejected: <Shield className="h-4 w-4 text-destructive" />,
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { pendingApprovals } = useSandboxStore();

  const approval = pendingApprovals.find(
    (a) => a.toolCallId === toolCall.id
  );
  const needsApproval = approval?.status === "pending";

  const icon = TOOL_ICONS[toolCall.toolName] || "🔧";
  const statusIcon = STATUS_ICONS[toolCall.status];

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
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-base">{icon}</span>
        <span className="flex-1 font-medium">{toolCall.toolName}</span>
        {statusIcon}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Reason */}
          {toolCall.reason && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Reason</span>
              <p className="mt-1 text-sm">{toolCall.reason}</p>
            </div>
          )}

          {/* Arguments */}
          {Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Arguments</span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted/50 p-2 text-xs">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {toolCall.result && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Result</span>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                {toolCall.result}
              </pre>
            </div>
          )}

          {/* Error */}
          {toolCall.error && (
            <div>
              <span className="text-xs font-medium text-destructive">Error</span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                {toolCall.error}
              </pre>
            </div>
          )}

          {/* Timing */}
          {toolCall.startedAt && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Started: {new Date(toolCall.startedAt).toLocaleTimeString()}</span>
              {toolCall.completedAt && (
                <span>
                  Duration:{" "}
                  {Math.round(
                    (new Date(toolCall.completedAt).getTime() -
                      new Date(toolCall.startedAt).getTime()) /
                      1000
                  )}
                  s
                </span>
              )}
            </div>
          )}

          {/* Approval actions */}
          {needsApproval && (
            <div className="flex items-center gap-2 rounded-md bg-status-waiting/10 p-3">
              <Shield className="h-4 w-4 text-status-waiting" />
              <span className="flex-1 text-sm">This action requires your approval</span>
              <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                Approve
              </button>
              <button className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent">
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}