import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
export type StatusBadge = "idle" | "thinking" | "waiting" | "running" | "completed" | "failed";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  toolsPanelOpen: boolean;
  toolsPanelTab: "tools" | "files" | "terminal" | "browser" | "approvals" | "audit";
  status: StatusBadge;
  selectedModel: string;
  emergencyStop: boolean;
  commandPaletteOpen: boolean;
  activeProjectId: string | null;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  toggleToolsPanel: () => void;
  setToolsPanelTab: (tab: UIState["toolsPanelTab"]) => void;
  setStatus: (status: StatusBadge) => void;
  setSelectedModel: (model: string) => void;
  triggerEmergencyStop: () => void;
  resetEmergencyStop: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setActiveProjectId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "dark",
  sidebarOpen: true,
  toolsPanelOpen: true,
  toolsPanelTab: "tools",
  status: "idle",
  selectedModel: "gpt-4",
  emergencyStop: false,
  commandPaletteOpen: false,
  activeProjectId: null,

  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleToolsPanel: () => set((state) => ({ toolsPanelOpen: !state.toolsPanelOpen })),
  setToolsPanelTab: (tab) => set({ toolsPanelTab: tab }),
  setStatus: (status) => set({ status }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  triggerEmergencyStop: () => set({ emergencyStop: true, status: "idle" }),
  resetEmergencyStop: () => set({ emergencyStop: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));