import { join } from "node:path";
import { store, type SandboxRecord } from "@/lib/db/store";
import { WORKSPACES_DIR } from "@/lib/runtime/paths";
import { LocalBackend } from "@/lib/sandbox/local-backend";
import { DockerBackend } from "@/lib/sandbox/docker-backend";
import type { ManagedServer, SandboxBackend } from "@/lib/sandbox/types";

export interface SandboxRuntime {
  id: string;
  backend: "docker" | "local";
  workspaceDir: string;
  port: number | null;
  status: SandboxRecord["status"];
  record: SandboxRecord;
}

/**
 * Chooses and drives the sandbox backend.
 *
 * SANDBOX_BACKEND=docker → require Docker (hard isolation)
 * SANDBOX_BACKEND=local  → always use the local process backend
 * SANDBOX_BACKEND=auto   → prefer Docker, fall back to local (default)
 */
export class SandboxManager {
  private docker = new DockerBackend();
  private local = new LocalBackend();
  private runtimes = new Map<string, SandboxRuntime>();

  async selectBackend(): Promise<SandboxBackend> {
    const preference = (process.env.SANDBOX_BACKEND || "auto").toLowerCase();
    if (preference === "local") return this.local;
    if (preference === "docker") {
      if (!(await this.docker.isAvailable())) {
        throw new Error(
          "SANDBOX_BACKEND=docker but the Docker daemon is unreachable. Start Docker or set SANDBOX_BACKEND=auto."
        );
      }
      return this.docker;
    }
    return (await this.docker.isAvailable()) ? this.docker : this.local;
  }

  async backendKind(): Promise<"docker" | "local"> {
    return (await this.selectBackend()).kind;
  }

  /** Re-attach to a sandbox that already exists in the store. */
  async get(sandboxId: string): Promise<SandboxRuntime | null> {
    const cached = this.runtimes.get(sandboxId);
    if (cached) return cached;

    const record = store.getSandboxRecord(sandboxId);
    if (!record || record.status === "destroyed") return null;

    const runtime: SandboxRuntime = {
      id: record.id,
      backend: record.backend,
      workspaceDir: record.workspaceDir,
      port: record.port ?? null,
      status: record.status,
      record,
    };
    this.runtimes.set(sandboxId, runtime);
    return runtime;
  }

  /** Get the project's live sandbox, creating one if needed. */
  async ensure(userId: string, projectId: string): Promise<SandboxRuntime> {
    const existing = store.listSandboxRecords(userId).find((s) => s.projectId === projectId);
    if (existing) {
      const runtime = await this.get(existing.id);
      if (runtime) return runtime;
    }
    return this.create(userId, projectId);
  }

  async create(userId: string, projectId: string): Promise<SandboxRuntime> {
    const backend = await this.selectBackend();
    const id = `sbx_${projectId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
    const workspaceDir = join(WORKSPACES_DIR, id);

    const record = store.createSandboxRecord({
      id,
      projectId,
      userId,
      backend: backend.kind,
      workspaceDir,
      status: "creating",
    });

    try {
      const { containerId, port } = await backend.create(id, workspaceDir);
      const updated = store.updateSandboxRecord(id, {
        status: "running",
        containerId: containerId ?? null,
        port: port ?? null,
      });
      const runtime: SandboxRuntime = {
        id,
        backend: backend.kind,
        workspaceDir,
        port: port ?? null,
        status: "running",
        record: updated || record,
      };
      this.runtimes.set(id, runtime);
      store.addAuditLog({
        userId,
        action: "sandbox.create",
        resource: "sandbox",
        resourceId: id,
        details: { backend: backend.kind, projectId },
      });
      return runtime;
    } catch (error) {
      store.updateSandboxRecord(id, { status: "error" });
      throw error;
    }
  }

  private backend(runtime: SandboxRuntime): SandboxBackend {
    return runtime.backend === "docker" ? this.docker : this.local;
  }

  async exec(runtime: SandboxRuntime, command: string, options?: { timeoutSeconds?: number; workingDir?: string }) {
    return this.backend(runtime).exec(runtime.id, command, options);
  }

  async readFile(runtime: SandboxRuntime, path: string) {
    return this.backend(runtime).readFile(runtime.id, path);
  }

  async writeFile(runtime: SandboxRuntime, path: string, content: string) {
    return this.backend(runtime).writeFile(runtime.id, path, content);
  }

  async listFiles(runtime: SandboxRuntime, path?: string, maxDepth?: number) {
    return this.backend(runtime).listFiles(runtime.id, path, maxDepth);
  }

  async deletePath(runtime: SandboxRuntime, path: string) {
    return this.backend(runtime).deletePath(runtime.id, path);
  }

  async mkdir(runtime: SandboxRuntime, path: string) {
    return this.backend(runtime).mkdir(runtime.id, path);
  }

  async renamePath(runtime: SandboxRuntime, from: string, to: string) {
    return this.backend(runtime).renamePath(runtime.id, from, to);
  }

  async startServer(runtime: SandboxRuntime, command: string, preferredPort?: number): Promise<ManagedServer> {
    const server = await this.backend(runtime).startServer(runtime.id, command, preferredPort);
    store.updateSandboxRecord(runtime.id, { port: server.port });
    runtime.port = server.port;
    store.addAuditLog({
      userId: runtime.record.userId,
      action: "server.start",
      resource: "sandbox",
      resourceId: runtime.id,
      details: { command, port: server.port },
    });
    return server;
  }

  async stopServer(runtime: SandboxRuntime, serverId?: string) {
    await this.backend(runtime).stopServer(runtime.id, serverId);
    store.addAuditLog({
      userId: runtime.record.userId,
      action: "server.stop",
      resource: "sandbox",
      resourceId: runtime.id,
      details: { serverId: serverId ?? "all" },
    });
  }

  listServers(runtime: SandboxRuntime): ManagedServer[] {
    return this.backend(runtime).listServers(runtime.id);
  }

  async stop(runtime: SandboxRuntime) {
    await this.backend(runtime).stop(runtime.id);
    store.updateSandboxRecord(runtime.id, { status: "stopped" });
    runtime.status = "stopped";
  }

  async destroy(runtime: SandboxRuntime) {
    await this.backend(runtime).destroy(runtime.id);
    store.updateSandboxRecord(runtime.id, { status: "destroyed" });
    this.runtimes.delete(runtime.id);
    store.addAuditLog({
      userId: runtime.record.userId,
      action: "sandbox.destroy",
      resource: "sandbox",
      resourceId: runtime.id,
      details: {},
    });
  }

  /** Snapshot every file in the workspace, for version history / rollback. */
  async captureFiles(runtime: SandboxRuntime): Promise<{ path: string; content: string }[]> {
    const backend = this.backend(runtime);
    const entries = await backend.listFiles(runtime.id, ".", 6);
    const files: { path: string; content: string }[] = [];
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      if (entry.size > 512 * 1024) continue;
      try {
        files.push({ path: entry.path, content: await backend.readFile(runtime.id, entry.path) });
      } catch {
        /* skip unreadable (binary) files */
      }
    }
    return files;
  }

  async restoreFiles(runtime: SandboxRuntime, files: { path: string; content: string }[]) {
    for (const file of files) {
      await this.writeFile(runtime, file.path, file.content);
    }
  }
}

const globalForSandbox = globalThis as unknown as { __xitSandboxManager?: SandboxManager };

export function getSandboxManager(): SandboxManager {
  if (!globalForSandbox.__xitSandboxManager) {
    globalForSandbox.__xitSandboxManager = new SandboxManager();
  }
  return globalForSandbox.__xitSandboxManager;
}
