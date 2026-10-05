"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PanelRightClose,
  PanelRightOpen,
  Square,
  Zap,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Cpu,
  Sparkles,
} from "lucide-react";

export interface TopBarUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  image: string | null;
}

interface TopBarProps {
  onToggleSidebar: () => void;
  onToggleToolsPanel: () => void;
  toolsPanelOpen: boolean;
  user: TopBarUser;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  aiReady: boolean;
}

const STATUS_CONFIG = {
  idle: { label: "Idle", className: "bg-status-idle" },
  thinking: { label: "Thinking", className: "bg-status-thinking" },
  waiting: { label: "Waiting for approval", className: "bg-status-waiting" },
  running: { label: "Running", className: "bg-status-running" },
  completed: { label: "Completed", className: "bg-status-completed" },
  failed: { label: "Failed", className: "bg-status-failed" },
} as const;

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  demo?: boolean;
}

export function TopBar({
  onToggleSidebar,
  onToggleToolsPanel,
  toolsPanelOpen,
  user,
  projects,
  activeProjectId,
  aiReady,
}: TopBarProps) {
  const router = useRouter();
  const { status, selectedModel, setSelectedModel, triggerEmergencyStop, emergencyStop, resetEmergencyStop, setActiveProjectId } =
    useUIStore();
  const setActiveModel = useChatStore((s) => s.setActiveModel);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [demoMode, setDemoMode] = useState(!aiReady);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        setModels(data.models || []);
        setProvider(data.provider);
        setDemoMode(Boolean(data.demoMode));
        if (data.active && !selectedModel) setSelectedModel(data.active);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedModel) setActiveModel(selectedModel);
  }, [selectedModel, setActiveModel]);

  const statusConfig = STATUS_CONFIG[status];
  const project = projects.find((p) => p.id === activeProjectId) || projects[0];

  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="h-8 w-8">
          <PanelRightClose className="h-4 w-4" />
        </Button>
        <div className="relative flex items-center gap-2">
          <select
            value={project?.id || ""}
            onChange={(e) => {
              setActiveProjectId(e.target.value);
              router.refresh();
            }}
            className="cursor-pointer appearance-none bg-transparent pr-4 text-sm font-medium outline-none"
          >
            {projects.length === 0 && <option value="">No project</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 h-3 w-3 text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 md:flex">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="cursor-pointer rounded-md border border-border bg-background px-2 py-1 text-xs outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {demoMode ? (
            <span
              className="flex items-center gap-1 rounded-full bg-status-waiting/15 px-2 py-0.5 text-[10px] text-status-waiting"
              title="No AI provider key configured — the built-in demo agent still drives real tools. Set OPENAI_API_KEY or OLLAMA_BASE_URL for full reasoning."
            >
              <Sparkles className="h-3 w-3" />
              Demo agent
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-status-running/15 px-2 py-0.5 text-[10px] text-status-running">
              <Cpu className="h-3 w-3" />
              {provider || "provider"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1">
          <span className={cn("h-2 w-2 rounded-full", statusConfig.className)} />
          <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
          {status === "waiting" && <Zap className="h-3 w-3 text-status-waiting" />}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={emergencyStop ? "destructive" : "outline"}
          size="sm"
          onClick={() => (emergencyStop ? resetEmergencyStop() : triggerEmergencyStop())}
          className="gap-2"
        >
          <Square className="h-3 w-3" />
          {emergencyStop ? "Resume" : "Stop"}
        </Button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[120px] truncate text-xs sm:inline">{user.name}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {user.role === "ADMIN" ? "Administrator" : "User"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
                >
                  <UserIcon className="h-4 w-4" /> Account settings
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>

        <Button variant="ghost" size="icon" onClick={onToggleToolsPanel} className="h-8 w-8">
          {toolsPanelOpen ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default TopBar;
