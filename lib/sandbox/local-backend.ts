import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import {
  DEFAULT_TIMEOUT_SECONDS,
  MAX_OUTPUT_BYTES,
  MAX_TIMEOUT_SECONDS,
  checkCommand,
  resolveWorkspacePath,
} from "@/lib/tools/policy";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  ManagedServer,
  SandboxBackend,
} from "@/lib/sandbox/types";

/**
 * Local process backend.
 *
 * Runs commands as the current OS user inside a per-sandbox workspace
 * directory. This is what makes X-IT usable in environments without Docker
 * (CI, preview sandboxes, laptops). It enforces the same command policy and
 * path jail as the Docker backend, but it is NOT a security boundary — the
 * Docker backend should be used for untrusted workloads.
 */
export class LocalBackend implements SandboxBackend {
  readonly kind = "local" as const;

  private workspaces = new Map<string, string>();
  private servers = new Map<string, ManagedServer>();
  private children = new Map<string, ChildProcess>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async create(sandboxId: string, workspaceDir: string) {
    mkdirSync(workspaceDir, { recursive: true });
    this.workspaces.set(sandboxId, workspaceDir);
    return { containerId: undefined, port: null };
  }

  private workspace(sandboxId: string): string {
    const dir = this.workspaces.get(sandboxId);
    if (!dir) throw new Error(`Sandbox ${sandboxId} is not registered with the local backend`);
    return dir;
  }

  private resolve(sandboxId: string, path: string): string {
    const root = this.workspace(sandboxId);
    const resolved = resolveWorkspacePath(root, path);
    if (!resolved) {
      throw Object.assign(new Error(`Path escapes the sandbox workspace: ${path}`), {
        code: "PATH_ESCAPE",
      });
    }
    return resolved;
  }

  async exec(sandboxId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
    const workspace = this.workspace(sandboxId);
    const started = Date.now();
    const timeoutMs =
      Math.min(options?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) * 1000;

    const violation = checkCommand(command);
    if (violation) {
      return {
        stdout: "",
        stderr: `BLOCKED by X-IT policy (${violation.rule}): ${violation.detail}. This action is never allowed.`,
        exitCode: 126,
        durationMs: Date.now() - started,
        timedOut: false,
        truncated: false,
        blocked: violation,
      };
    }

    const cwd = options?.workingDir
      ? this.resolve(sandboxId, options.workingDir)
      : workspace;

    return new Promise<ExecResult>((resolve) => {
      const child = spawn("/bin/bash", ["-lc", command], {
        cwd,
        env: {
          ...process.env,
          X_IT_SANDBOX_ID: sandboxId,
          X_IT_WORKSPACE: workspace,
          ...(options?.env || {}),
        },
        detached: true,
      });

      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      let settled = false;

      const append = (target: "out" | "err", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (target === "out") {
          if (stdout.length + text.length > MAX_OUTPUT_BYTES) {
            stdout += text.slice(0, Math.max(0, MAX_OUTPUT_BYTES - stdout.length));
            truncated = true;
          } else stdout += text;
        } else {
          if (stderr.length + text.length > MAX_OUTPUT_BYTES) {
            stderr += text.slice(0, Math.max(0, MAX_OUTPUT_BYTES - stderr.length));
            truncated = true;
          } else stderr += text;
        }
      };

      child.stdout.on("data", (c: Buffer) => append("out", c));
      child.stderr.on("data", (c: Buffer) => append("err", c));

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, timeoutMs);

      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode: timedOut ? 124 : exitCode,
          durationMs: Date.now() - started,
          timedOut,
          truncated,
        });
      };

      child.on("error", (error) => {
        stderr += `\n${error.message}`;
        finish(127);
      });
      child.on("close", (code) => finish(code ?? 0));
    });
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    return readFileSync(this.resolve(sandboxId, path), "utf8");
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const target = this.resolve(sandboxId, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  async listFiles(sandboxId: string, path = ".", maxDepth = 1): Promise<FileEntry[]> {
    const base = this.resolve(sandboxId, path);
    if (!existsSync(base)) return [];
    const out: FileEntry[] = [];
    const walk = (dir: string, depth: number) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = join(dir, entry.name);
        const stats = statSync(full);
        out.push({
          name: entry.name,
          path: `./${relative(this.workspace(sandboxId), full)}`,
          type: entry.isDirectory() ? "directory" : "file",
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
        if (entry.isDirectory() && depth < maxDepth) walk(full, depth + 1);
      }
    };
    walk(base, 1);
    return out.slice(0, 500);
  }

  async deletePath(sandboxId: string, path: string): Promise<void> {
    const target = this.resolve(sandboxId, path);
    if (target === this.workspace(sandboxId)) {
      throw new Error("Refusing to delete the sandbox workspace root");
    }
    rmSync(target, { recursive: true, force: true });
  }

  async mkdir(sandboxId: string, path: string): Promise<void> {
    mkdirSync(this.resolve(sandboxId, path), { recursive: true });
  }

  async renamePath(sandboxId: string, from: string, to: string): Promise<void> {
    renameSync(this.resolve(sandboxId, from), this.resolve(sandboxId, to));
  }

  async allocatePort(preferred?: number): Promise<number> {
    const tryPort = (port: number) =>
      new Promise<boolean>((resolve) => {
        const probe = createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(port, "0.0.0.0");
      });

    if (preferred) {
      const used = [...this.servers.values()].some((s) => s.port === preferred);
      if (!used && (await tryPort(preferred))) return preferred;
    }
    const start = Number(process.env.SANDBOX_PORT_RANGE_START || 8080);
    const end = Number(process.env.SANDBOX_PORT_RANGE_END || 9080);
    for (let port = start; port <= end; port++) {
      const used = [...this.servers.values()].some((s) => s.port === port);
      if (used) continue;
      if (await tryPort(port)) return port;
    }
    throw new Error(`No free port available in range ${start}-${end}`);
  }

  async startServer(sandboxId: string, command: string, preferredPort?: number): Promise<ManagedServer> {
    const workspace = this.workspace(sandboxId);
    const violation = checkCommand(command);
    if (violation) {
      throw new Error(`BLOCKED by X-IT policy (${violation.rule}): ${violation.detail}`);
    }

    const port = await this.allocatePort(preferredPort);
    const id = `srv_${sandboxId}_${Date.now().toString(36)}`;
    const logFile = join(workspace, ".x-it-server.log");
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd: workspace,
      env: { ...process.env, PORT: String(port), X_IT_PORT: String(port) },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const server: ManagedServer = {
      id,
      sandboxId,
      command,
      port,
      pid: child.pid ?? -1,
      startedAt: new Date().toISOString(),
      status: "running",
      logFile,
    };

    const appendLog = (chunk: Buffer) => {
      try {
        writeFileSync(logFile, chunk, { flag: "a" });
      } catch {
        /* ignore log write failures */
      }
    };
    child.stdout?.on("data", appendLog);
    child.stderr?.on("data", appendLog);
    child.on("exit", (code) => {
      const current = this.servers.get(id);
      if (current) {
        current.status = code === 0 ? "stopped" : "error";
      }
    });

    this.servers.set(id, server);
    this.children.set(id, child);
    return server;
  }

  async stopServer(sandboxId: string, serverId?: string): Promise<void> {
    for (const [id, server] of this.servers) {
      if (server.sandboxId !== sandboxId) continue;
      if (serverId && id !== serverId) continue;
      const child = this.children.get(id);
      try {
        if (child?.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child?.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      }
      server.status = "stopped";
      this.children.delete(id);
    }
  }

  listServers(sandboxId?: string): ManagedServer[] {
    return [...this.servers.values()].filter((s) => (sandboxId ? s.sandboxId === sandboxId : true));
  }

  async stop(sandboxId: string): Promise<void> {
    await this.stopServer(sandboxId);
  }

  async destroy(sandboxId: string): Promise<void> {
    await this.stopServer(sandboxId);
    for (const [id, server] of [...this.servers]) {
      if (server.sandboxId === sandboxId) this.servers.delete(id);
    }
    this.workspaces.delete(sandboxId);
  }
}
