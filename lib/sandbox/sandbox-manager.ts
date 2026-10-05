import Docker from "dockerode";

export interface SandboxConfig {
  projectId: string;
  cpuLimit?: number;
  memoryLimit?: number;
  diskLimit?: number;
  baseImage?: string;
  environment?: Record<string, string>;
}

export interface SandboxInstance {
  id: string;
  containerId: string;
  status: "creating" | "running" | "stopped" | "error" | "destroyed";
  port: number;
  createdAt: Date;
}

// Port allocation
let nextPort = 8080;
const usedPorts = new Set<number>();

function allocatePort(): number {
  while (usedPorts.has(nextPort)) {
    nextPort++;
    if (nextPort > 9080) nextPort = 8080;
  }
  usedPorts.add(nextPort);
  return nextPort;
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

/**
 * SandboxManager handles Docker container lifecycle for isolated AI environments.
 * Each project gets its own container with resource limits and network isolation.
 */
export class SandboxManager {
  private docker: Docker;
  private sandboxes: Map<string, SandboxInstance> = new Map();

  constructor() {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_HOST || "/var/run/docker.sock",
    });
  }

  /**
   * Create and start a new sandbox container for a project
   */
  async createSandbox(config: SandboxConfig): Promise<SandboxInstance> {
    const sandboxId = `sandbox-${config.projectId}-${Date.now()}`;
    const port = allocatePort();
    const baseImage = config.baseImage || process.env.SANDBOX_BASE_IMAGE || "x-it-sandbox:latest";

    try {
      // Check if image exists, build if not
      await this.ensureImage(baseImage);

      // Create container with resource limits
      const container = await this.docker.createContainer({
        Image: baseImage,
        name: sandboxId,
        Hostname: sandboxId,
        Env: [
          `PROJECT_ID=${config.projectId}`,
          ...Object.entries(config.environment || {}).map(
            ([k, v]) => `${k}=${v}`
          ),
        ],
        HostConfig: {
          // Resource limits
          NanoCpus: (config.cpuLimit || 2) * 1e9,
          Memory: (config.memoryLimit || 2048) * 1024 * 1024,
          MemorySwap: (config.memoryLimit || 2048) * 2 * 1024 * 1024,
          // Network isolation
          NetworkMode: "bridge",
          PortBindings: {
            "8080/tcp": [{ HostPort: port.toString() }],
          },
          // Security
          SecurityOpt: ["no-new-privileges:true"],
          ReadonlyRootfs: false,
          // Resource limits
          PidsLimit: 256,
          Ulimits: [
            { Name: "nofile", Soft: 1024, Hard: 2048 },
            { Name: "nproc", Soft: 256, Hard: 512 },
          ],
          // Volume for persistent project data
          Binds: [
            `${sandboxId}-data:/home/sandbox/project`,
          ],
        },
        Labels: {
          "x-it.project": config.projectId,
          "x-it.sandbox": sandboxId,
        },
        // Working directory
        WorkingDir: "/home/sandbox/project",
      });

      await container.start();

      const instance: SandboxInstance = {
        id: sandboxId,
        containerId: container.id,
        status: "running",
        port,
        createdAt: new Date(),
      };

      this.sandboxes.set(sandboxId, instance);
      return instance;
    } catch (error) {
      releasePort(port);
      throw new Error(
        `Failed to create sandbox: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a command inside a sandbox container
   */
  async execCommand(
    sandboxId: string,
    command: string,
    options?: { timeout?: number; workingDir?: string }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const container = this.docker.getContainer(sandbox.containerId);

    const exec = await container.exec({
      Cmd: ["/bin/bash", "-c", command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.workingDir || "/home/sandbox/project",
      Env: [`TIMEOUT=${options?.timeout || 30}`],
    });

    const stream = await exec.start({ Detach: false });

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk: Buffer) => {
        const data = chunk.toString();
        // Docker multiplexed stream: first byte indicates stdout(1) or stderr(2)
        if (chunk[0] === 1) {
          stdout += data.slice(8);
        } else if (chunk[0] === 2) {
          stderr += data.slice(8);
        } else {
          stdout += data;
        }
      });

      stream.on("end", async () => {
        const inspect = await exec.inspect();
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: inspect.ExitCode || 0,
        });
      });

      stream.on("error", reject);

      // Timeout
      if (options?.timeout) {
        setTimeout(() => {
          stream.destroy();
          reject(new Error(`Command timed out after ${options.timeout}s`));
        }, options.timeout * 1000);
      }
    });
  }

  /**
   * Read a file from inside a sandbox container
   */
  async readFile(sandboxId: string, path: string): Promise<string> {
    return this.execCommand(sandboxId, `cat "${path}"`).then(
      (r) => r.stdout
    );
  }

  /**
   * Write a file inside a sandbox container
   */
  async writeFile(
    sandboxId: string,
    path: string,
    content: string
  ): Promise<void> {
    // Use base64 encoding to handle special characters
    const encoded = Buffer.from(content).toString("base64");
    await this.execCommand(
      sandboxId,
      `mkdir -p "$(dirname "${path}")" && echo "${encoded}" | base64 -d > "${path}"`
    );
  }

  /**
   * List files in a directory inside a sandbox
   */
  async listFiles(
    sandboxId: string,
    path: string = "/home/sandbox/project"
  ): Promise<{ name: string; path: string; type: "file" | "directory"; size: number }[]> {
    const result = await this.execCommand(
      sandboxId,
      `find "${path}" -maxdepth 1 -not -path "${path}" -exec stat -c '{"name":"%n","type":"%F","size":%s}' {} \\; 2>/dev/null || echo "[]"`,
      { timeout: 10 }
    );

    try {
      return result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parsed = JSON.parse(line);
          return {
            name: parsed.name.split("/").pop(),
            path: parsed.name,
            type: parsed.type === "directory" ? "directory" : "file",
            size: parsed.size,
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Delete a file inside a sandbox
   */
  async deleteFile(sandboxId: string, path: string): Promise<void> {
    await this.execCommand(sandboxId, `rm -rf "${path}"`);
  }

  /**
   * Take a screenshot of the sandbox browser or desktop
   */
  async takeScreenshot(sandboxId: string): Promise<Buffer> {
    const result = await this.execCommand(
      sandboxId,
      `chromium-browser --headless --disable-gpu --screenshot=/tmp/screenshot.png --no-sandbox --window-size=1280,720 2>/dev/null && cat /tmp/screenshot.png | base64`,
      { timeout: 30 }
    );
    return Buffer.from(result.stdout, "base64");
  }

  /**
   * Stop a sandbox container
   */
  async stopSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const container = this.docker.getContainer(sandbox.containerId);
    await container.stop({ t: 10 });
    sandbox.status = "stopped";
    releasePort(sandbox.port);
  }

  /**
   * Destroy a sandbox container and its data
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const container = this.docker.getContainer(sandbox.containerId);
      await container.stop({ t: 5 }).catch(() => {});
      await container.remove({ v: true });
    } catch {
      // Container may already be removed
    }

    sandbox.status = "destroyed";
    releasePort(sandbox.port);
    this.sandboxes.delete(sandboxId);
  }

  /**
   * Get sandbox status
   */
  getSandbox(sandboxId: string): SandboxInstance | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * List all active sandboxes
   */
  listSandboxes(): SandboxInstance[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Ensure Docker image exists, build if necessary
   */
  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch {
      console.log(`[Sandbox] Image ${imageName} not found, building...`);
      // In production, build from sandbox/Dockerfile
      throw new Error(
        `Sandbox image '${imageName}' not found. Run 'docker build -t ${imageName} ./sandbox' first.`
      );
    }
  }
}

// Singleton instance
let sandboxManager: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManager) {
    sandboxManager = new SandboxManager();
  }
  return sandboxManager;
}