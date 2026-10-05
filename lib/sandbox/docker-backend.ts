import Docker from "dockerode";
import { DEFAULT_TIMEOUT_SECONDS, MAX_OUTPUT_BYTES, checkCommand } from "@/lib/tools/policy";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  ManagedServer,
  SandboxBackend,
} from "@/lib/sandbox/types";

const WORKDIR = "/home/sandbox/project";

interface ContainerHandle {
  containerId: string;
  sandboxId: string;
}

/**
 * Docker backend — the real security boundary.
 *
 * Each sandbox is its own container with CPU/memory/PID limits, a private
 * volume, and no host filesystem access. Requires the sandbox image:
 *   docker build -t x-it-sandbox ./sandbox
 */
export class DockerBackend implements SandboxBackend {
  readonly kind = "docker" as const;
  private docker: Docker;
  private handles = new Map<string, ContainerHandle>();
  private ports = new Map<string, number>();
  private servers = new Map<string, ManagedServer>();

  constructor() {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_HOST || "/var/run/docker.sock",
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  private handle(sandboxId: string): ContainerHandle {
    const handle = this.handles.get(sandboxId);
    if (!handle) throw new Error(`Sandbox ${sandboxId} has no Docker container`);
    return handle;
  }

  async create(sandboxId: string, _workspaceDir: string) {
    const image = process.env.SANDBOX_BASE_IMAGE || "x-it-sandbox:latest";
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      throw new Error(
        `Sandbox image '${image}' not found. Build it with: docker build -t ${image} ./sandbox`
      );
    }

    const port = await this.pickHostPort();
    const container = await this.docker.createContainer({
      Image: image,
      name: sandboxId,
      Hostname: sandboxId,
      WorkingDir: WORKDIR,
      Env: [`PROJECT_ID=${sandboxId}`, "X_IT_SANDBOX=1"],
      HostConfig: {
        NanoCpus: Number(process.env.SANDBOX_CPU_LIMIT || 2) * 1e9,
        Memory: Number(process.env.SANDBOX_MEMORY_LIMIT || 2048) * 1024 * 1024,
        MemorySwap: Number(process.env.SANDBOX_MEMORY_LIMIT || 2048) * 2 * 1024 * 1024,
        NetworkMode: "bridge",
        PortBindings: { "8080/tcp": [{ HostPort: String(port) }] },
        SecurityOpt: ["no-new-privileges:true"],
        PidsLimit: 256,
        Ulimits: [
          { Name: "nofile", Soft: 1024, Hard: 2048 },
          { Name: "nproc", Soft: 256, Hard: 512 },
        ],
        Binds: [`${sandboxId}-data:${WORKDIR}`],
        ReadonlyRootfs: false,
      },
      Labels: { "x-it.sandbox": sandboxId },
    });

    await container.start();
    this.handles.set(sandboxId, { containerId: container.id, sandboxId });
    this.ports.set(sandboxId, port);
    return { containerId: container.id, port };
  }

  private async pickHostPort(): Promise<number> {
    const start = Number(process.env.SANDBOX_PORT_RANGE_START || 8080);
    const end = Number(process.env.SANDBOX_PORT_RANGE_END || 9080);
    const used = new Set(this.ports.values());
    for (let port = start; port <= end; port++) {
      if (!used.has(port)) return port;
    }
    throw new Error("No free host port available for sandbox");
  }

  /** Run a command inside the container and demultiplex stdout/stderr. */
  private async run(sandboxId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
    const started = Date.now();
    const violation = checkCommand(command);
    if (violation) {
      return {
        stdout: "",
        stderr: `BLOCKED by X-IT policy (${violation.rule}): ${violation.detail}`,
        exitCode: 126,
        durationMs: Date.now() - started,
        timedOut: false,
        truncated: false,
        blocked: violation,
      };
    }

    const { containerId } = this.handle(sandboxId);
    const container = this.docker.getContainer(containerId);
    const timeoutSeconds = Math.min(options?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, 300);

    const exec = await container.exec({
      Cmd: ["/bin/bash", "-lc", command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.workingDir || WORKDIR,
      Env: Object.entries(options?.env || {}).map(([k, v]) => `${k}=${v}`),
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    let stdout = "";
    let stderr = "";
    let truncated = false;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error(`Command timed out after ${timeoutSeconds}s`));
      }, timeoutSeconds * 1000);

      stream.on("data", (chunk: Buffer) => {
        // Docker multiplexed stream: [stream_type, 0, 0, 0, size(4)] + payload
        let offset = 0;
        while (offset + 8 <= chunk.length) {
          const type = chunk[offset];
          const size = chunk.readUInt32BE(offset + 4);
          const payload = chunk.subarray(offset + 8, offset + 8 + size).toString("utf8");
          if (type === 2) {
            if (stderr.length < MAX_OUTPUT_BYTES) stderr += payload;
            else truncated = true;
          } else {
            if (stdout.length < MAX_OUTPUT_BYTES) stdout += payload;
            else truncated = true;
          }
          offset += 8 + size;
        }
      });

      stream.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
      stream.on("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const inspect = await exec.inspect();
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode: inspect.ExitCode ?? 0,
      durationMs: Date.now() - started,
      timedOut: false,
      truncated,
    };
  }

  async exec(sandboxId: string, command: string, options?: ExecOptions): Promise<ExecResult> {
    return this.run(sandboxId, command, options);
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const result = await this.run(
      sandboxId,
      `base64 -w0 -- ${shellQuote(path)} 2>/dev/null || base64 -- ${shellQuote(path)}`,
      { timeoutSeconds: 20 }
    );
    if (result.exitCode !== 0) throw new Error(result.stderr || `Cannot read ${path}`);
    return Buffer.from(result.stdout, "base64").toString("utf8");
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const encoded = Buffer.from(content, "utf8").toString("base64");
    const result = await this.run(
      sandboxId,
      `mkdir -p "$(dirname ${shellQuote(path)})" && printf '%s' '${encoded}' | base64 -d > ${shellQuote(path)}`,
      { timeoutSeconds: 30 }
    );
    if (result.exitCode !== 0) throw new Error(result.stderr || `Cannot write ${path}`);
  }

  async listFiles(sandboxId: string, path = WORKDIR, maxDepth = 1): Promise<FileEntry[]> {
    const result = await this.run(
      sandboxId,
      `cd ${shellQuote(path)} 2>/dev/null && find . -maxdepth ${Math.max(1, maxDepth)} -not -path '*/node_modules/*' -not -path '*/.git/*' -printf '%y|%s|%TY-%Tm-%TdT%TH:%TM:%TS|%p\\n' | head -500`,
      { timeoutSeconds: 20 }
    );
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [type, size, modified, rawPath] = line.split("|");
        return {
          name: rawPath.split("/").pop() || rawPath,
          path: rawPath === "." ? "./" : rawPath,
          type: type === "d" ? ("directory" as const) : ("file" as const),
          size: Number(size) || 0,
          modifiedAt: modified || new Date().toISOString(),
        };
      });
  }

  async deletePath(sandboxId: string, path: string): Promise<void> {
    await this.run(sandboxId, `rm -rf -- ${shellQuote(path)}`, { timeoutSeconds: 20 });
  }

  async mkdir(sandboxId: string, path: string): Promise<void> {
    await this.run(sandboxId, `mkdir -p -- ${shellQuote(path)}`, { timeoutSeconds: 20 });
  }

  async renamePath(sandboxId: string, from: string, to: string): Promise<void> {
    await this.run(sandboxId, `mv -- ${shellQuote(from)} ${shellQuote(to)}`, { timeoutSeconds: 20 });
  }

  async startServer(sandboxId: string, command: string, preferredPort?: number): Promise<ManagedServer> {
    const port = preferredPort || 8080;
    const id = `srv_${sandboxId}_${Date.now().toString(36)}`;
    const logFile = `/tmp/${id}.log`;
    await this.run(
      sandboxId,
      `cd ${WORKDIR} && (PORT=${port} nohup bash -lc ${shellQuote(command)} > ${logFile} 2>&1 & echo $! > /tmp/${id}.pid)`,
      { timeoutSeconds: 15 }
    );
    const pidResult = await this.run(sandboxId, `cat /tmp/${id}.pid 2>/dev/null || echo -1`, {
      timeoutSeconds: 10,
    });
    const server: ManagedServer = {
      id,
      sandboxId,
      command,
      port: this.ports.get(sandboxId) || port,
      pid: Number(pidResult.stdout.trim()) || -1,
      startedAt: new Date().toISOString(),
      status: "running",
      logFile,
    };
    this.servers.set(id, server);
    return server;
  }

  async stopServer(sandboxId: string, serverId?: string): Promise<void> {
    for (const [id, server] of this.servers) {
      if (server.sandboxId !== sandboxId) continue;
      if (serverId && id !== serverId) continue;
      await this.run(sandboxId, `kill -TERM ${server.pid} 2>/dev/null || true`, { timeoutSeconds: 10 });
      server.status = "stopped";
    }
  }

  listServers(sandboxId?: string): ManagedServer[] {
    return [...this.servers.values()].filter((s) => (sandboxId ? s.sandboxId === sandboxId : true));
  }

  async stop(sandboxId: string): Promise<void> {
    await this.stopServer(sandboxId);
    const handle = this.handles.get(sandboxId);
    if (!handle) return;
    await this.docker.getContainer(handle.containerId).stop({ t: 10 }).catch(() => undefined);
  }

  async destroy(sandboxId: string): Promise<void> {
    await this.stop(sandboxId);
    const handle = this.handles.get(sandboxId);
    if (handle) {
      await this.docker
        .getContainer(handle.containerId)
        .remove({ v: true, force: true })
        .catch(() => undefined);
      this.handles.delete(sandboxId);
    }
    this.ports.delete(sandboxId);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
