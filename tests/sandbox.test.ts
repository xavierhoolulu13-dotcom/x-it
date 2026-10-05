import { beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { LocalBackend } from "@/lib/sandbox/local-backend";
import { getSandboxManager, type SandboxRuntime } from "@/lib/sandbox/manager";
import { store, newId } from "@/lib/db/store";

describe("local sandbox backend", () => {
  const backend = new LocalBackend();
  const sandboxId = `test-${Date.now().toString(36)}`;
  const workspace = join(process.env.X_IT_DATA_DIR as string, "workspaces", sandboxId);

  beforeAll(async () => {
    await backend.create(sandboxId, workspace);
  });

  it("executes shell commands and reports exit codes", async () => {
    const ok = await backend.exec(sandboxId, "echo hello && pwd");
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("hello");
    expect(ok.stdout).toContain(workspace);

    const failing = await backend.exec(sandboxId, "exit 3");
    expect(failing.exitCode).toBe(3);
  });

  it("captures stderr separately", async () => {
    const result = await backend.exec(sandboxId, "echo to-stderr 1>&2");
    expect(result.stderr).toContain("to-stderr");
    expect(result.stdout).toBe("");
  });

  it("refuses policy-violating commands", async () => {
    const result = await backend.exec(sandboxId, "rm -rf /");
    expect(result.exitCode).toBe(126);
    expect(result.blocked?.rule).toBe("rm-root");
  });

  it("enforces the timeout", async () => {
    const result = await backend.exec(sandboxId, "sleep 5", { timeoutSeconds: 1 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
  });

  it("writes, reads, lists, renames and deletes files", async () => {
    await backend.writeFile(sandboxId, "./src/hello.txt", "x-it sandbox");
    expect(await backend.readFile(sandboxId, "./src/hello.txt")).toBe("x-it sandbox");

    const entries = await backend.listFiles(sandboxId, ".", 3);
    expect(entries.some((e) => e.path.endsWith("src/hello.txt"))).toBe(true);

    await backend.renamePath(sandboxId, "./src/hello.txt", "./src/renamed.txt");
    expect(await backend.readFile(sandboxId, "./src/renamed.txt")).toBe("x-it sandbox");

    await backend.deletePath(sandboxId, "./src/renamed.txt");
    await expect(backend.readFile(sandboxId, "./src/renamed.txt")).rejects.toThrow();
  });

  it("blocks path escapes from the workspace", async () => {
    await expect(backend.readFile(sandboxId, "../../etc/passwd")).rejects.toThrow(/escapes/i);
    await expect(backend.writeFile(sandboxId, "../outside.txt", "nope")).rejects.toThrow(/escapes/i);
  });

  it("starts and stops a long-running server on an allocated port", async () => {
    const server = await backend.startServer(
      sandboxId,
      "python3 -m http.server $PORT --bind 127.0.0.1",
      undefined
    );
    expect(server.port).toBeGreaterThan(1023);

    let served = false;
    for (let attempt = 0; attempt < 20 && !served; attempt++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const res = await fetch(`http://127.0.0.1:${server.port}/`);
        served = res.ok;
      } catch {
        /* not up yet */
      }
    }
    expect(served).toBe(true);

    await backend.stopServer(sandboxId, server.id);
    expect(backend.listServers(sandboxId).every((s) => s.status !== "running")).toBe(true);
  });
});

describe("sandbox manager", () => {
  let runtime: SandboxRuntime;

  beforeAll(async () => {
    const user = store.createUser({ email: `sbx-${newId("t")}@example.com`, name: "Sandbox Tester" });
    const project = store.createProject({ name: "Sandbox project", userId: user.id });
    runtime = await getSandboxManager().ensure(user.id, project.id);
  });

  it("uses the local backend when Docker is not configured", () => {
    expect(runtime.backend).toBe("local");
    expect(runtime.status).toBe("running");
  });

  it("reuses the same sandbox for the same project", async () => {
    const again = await getSandboxManager().ensure(runtime.record.userId, runtime.record.projectId);
    expect(again.id).toBe(runtime.id);
  });

  it("captures and restores workspace snapshots", async () => {
    const manager = getSandboxManager();
    await manager.writeFile(runtime, "./keep.txt", "original");

    const files = await manager.captureFiles(runtime);
    expect(files.some((f) => f.path.endsWith("keep.txt"))).toBe(true);

    await manager.writeFile(runtime, "./keep.txt", "modified");
    await manager.restoreFiles(runtime, files);
    expect(await manager.readFile(runtime, "./keep.txt")).toBe("original");
  });

  it("reports tool-callable status", async () => {
    const manager = getSandboxManager();
    const servers = manager.listServers(runtime);
    expect(Array.isArray(servers)).toBe(true);
  });
});
