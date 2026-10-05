export interface ExecOptions {
  timeoutSeconds?: number;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  blocked?: { rule: string; detail: string };
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
}

export interface ManagedServer {
  id: string;
  sandboxId: string;
  command: string;
  port: number;
  pid: number;
  startedAt: string;
  status: "running" | "stopped" | "error";
  logFile?: string;
}

export interface SandboxBackend {
  readonly kind: "docker" | "local";
  /** Prepare runtime for a sandbox (container start / workspace dir). */
  create(sandboxId: string, workspaceDir: string): Promise<{ containerId?: string; port?: number | null }>;
  /** Run a command, enforcing policy and timeouts. */
  exec(sandboxId: string, command: string, options?: ExecOptions): Promise<ExecResult>;
  readFile(sandboxId: string, path: string): Promise<string>;
  writeFile(sandboxId: string, path: string, content: string): Promise<void>;
  listFiles(sandboxId: string, path?: string, maxDepth?: number): Promise<FileEntry[]>;
  deletePath(sandboxId: string, path: string): Promise<void>;
  mkdir(sandboxId: string, path: string): Promise<void>;
  renamePath(sandboxId: string, from: string, to: string): Promise<void>;
  startServer(sandboxId: string, command: string, preferredPort?: number): Promise<ManagedServer>;
  stopServer(sandboxId: string, serverId?: string): Promise<void>;
  listServers(sandboxId?: string): ManagedServer[];
  isAvailable(): Promise<boolean>;
  stop(sandboxId: string): Promise<void>;
  destroy(sandboxId: string): Promise<void>;
}
