"use client";

import { useUIStore, type StatusBadge } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import {
  PanelRightClose,
  PanelRightOpen,
  Square,
  Zap,
  ChevronDown,
} from "lucide-react";

interface TopBarProps {
  onToggleSidebar: () => void;
  onToggleToolsPanel: () => void;
  toolsPanelOpen: boolean;
}

const STATUS_CONFIG: Record<StatusBadge, { label: string; color: string; icon: React.ReactNode }> = {
  idle: { label: "Idle", color: "bg-status-idle", icon: null },
  thinking: { label: "Thinking", color: "bg-status-thinking", icon: null },
  waiting: { label: "Waiting for approval", color: "bg-status-waiting", icon: <Zap className="h-3 w-3" /> },
  running: { label: "Running", color: "bg-status-running", icon: null },
  completed: { label: "Completed", color: "bg-status-completed", icon: null },
  failed: { label: "Failed", color: "bg-status-failed", icon: null },
};

export function TopBar({ onToggleSidebar, onToggleToolsPanel, toolsPanelOpen }: TopBarProps) {
  const { status, selectedModel, setSelectedModel, triggerEmergencyStop, emergencyStop, resetEmergencyStop } = useUIStore();
  const statusConfig = STATUS_CONFIG[status];

  const models = [
    { id: "gpt-4", name: "GPT-4" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5" },
    { id: "claude-3-opus", name: "Claude 3 Opus" },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
    { id: "ollama/llama3", name: "Llama 3 (Local)" },
  ];

  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      {/* Left: Sidebar toggle + Project name */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="h-8 w-8">
          <PanelRightClose className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Default Project</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      {/* Center: Model selector + Status */}
      <div className="flex items-center gap-4">
        {/* Model Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${statusConfig.color} ${status === "thinking" || status === "running" ? "animate-pulse" : ""}`} />
          <span className="text-xs text-muted-foreground">
            {statusConfig.label}
          </span>
          {statusConfig.icon}
        </div>
      </div>

      {/* Right: Emergency stop + Tools panel toggle */}
      <div className="flex items-center gap-2">
        {/* Emergency Stop */}
        <Button
          variant={emergencyStop ? "destructive" : "outline"}
          size="sm"
          onClick={() => {
            if (emergencyStop) {
              resetEmergencyStop();
            } else {
              triggerEmergencyStop();
            }
          }}
          className="gap-2"
        >
          <Square className="h-3 w-3" />
          {emergencyStop ? "Resume" : "Stop"}
        </Button>

        {/* Tools Panel Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleToolsPanel}
          className="h-8 w-8"
        >
          {toolsPanelOpen ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}