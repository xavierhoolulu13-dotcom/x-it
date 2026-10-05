import { create } from "zustand";

export interface Sandbox {
  id: string;
  projectId: string;
  containerId?: string;
  status: "creating" | "running" | "stopped" | "error" | "destroyed";
  cpuLimit: number;
  memoryLimit: number;
  diskLimit: number;
  ports: Record<string, number>;
  lastActiveAt: Date;
  createdAt: Date;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
  isExpanded?: boolean;
}

export interface ApprovalItem {
  id: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: Date;
  expiresAt: Date;
  decidedAt?: Date;
}

export interface AuditEvent {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

interface SandboxState {
  sandboxes: Sandbox[];
  activeSandboxId: string | null;
  fileTree: FileNode[];
  activeFilePath: string | null;
  fileContents: Record<string, string>;
  pendingApprovals: ApprovalItem[];
  auditLogs: AuditEvent[];
  activeProcesses: { id: string; name: string; command: string; status: string }[];
  terminalOutput: string[];

  // Actions
  setSandboxes: (sandboxes: Sandbox[]) => void;
  addSandbox: (sandbox: Sandbox) => void;
  updateSandbox: (id: string, updates: Partial<Sandbox>) => void;
  setActiveSandbox: (id: string | null) => void;
  setFileTree: (tree: FileNode[]) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (path: string, content: string) => void;
  addApproval: (approval: ApprovalItem) => void;
  updateApproval: (id: string, updates: Partial<ApprovalItem>) => void;
  setAuditLogs: (logs: AuditEvent[]) => void;
  addAuditLog: (log: AuditEvent) => void;
  setActiveProcesses: (processes: SandboxState["activeProcesses"]) => void;
  addTerminalOutput: (output: string) => void;
  clearTerminalOutput: () => void;
}

export const useSandboxStore = create<SandboxState>((set) => ({
  sandboxes: [],
  activeSandboxId: null,
  fileTree: [],
  activeFilePath: null,
  fileContents: {},
  pendingApprovals: [],
  auditLogs: [],
  activeProcesses: [],
  terminalOutput: [],

  setSandboxes: (sandboxes) => set({ sandboxes }),
  addSandbox: (sandbox) =>
    set((state) => ({
      sandboxes: [...state.sandboxes, sandbox],
      activeSandboxId: sandbox.id,
    })),
  updateSandbox: (id, updates) =>
    set((state) => ({
      sandboxes: state.sandboxes.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  setActiveSandbox: (id) => set({ activeSandboxId: id }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setActiveFile: (path) => set({ activeFilePath: path }),
  setFileContent: (path, content) =>
    set((state) => ({
      fileContents: { ...state.fileContents, [path]: content },
    })),
  addApproval: (approval) =>
    set((state) => ({
      pendingApprovals: [...state.pendingApprovals, approval],
    })),
  updateApproval: (id, updates) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  setAuditLogs: (logs) => set({ auditLogs: logs }),
  addAuditLog: (log) =>
    set((state) => ({ auditLogs: [log, ...state.auditLogs] })),
  setActiveProcesses: (processes) => set({ activeProcesses: processes }),
  addTerminalOutput: (output) =>
    set((state) => ({
      terminalOutput: [...state.terminalOutput, output],
    })),
  clearTerminalOutput: () => set({ terminalOutput: [] }),
}));