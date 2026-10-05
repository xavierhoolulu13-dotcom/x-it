import { beforeAll, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/tools/executor";
import { decideApproval } from "@/lib/tools/approvals";
import { getSandboxManager, type SandboxRuntime } from "@/lib/sandbox/manager";
import { store, newId } from "@/lib/db/store";
import { getPermissionLevel, toProviderTools, TOOL_DEFINITIONS } from "@/lib/tools/tool-definitions";

const userId = `user-${newId("t")}`;

describe("tool definitions", () => {
  it("exposes all three permission tiers", () => {
    const levels = new Set(TOOL_DEFINITIONS.map((t) => t.permissionLevel));
    expect(levels.has("read_only")).toBe(true);
    expect(levels.has("approval_required")).toBe(true);
    expect(levels.has("always_blocked")).toBe(true);
  });

  it("never sends always-blocked tools to the model", () => {
    const providerTools = toProviderTools();
    expect(providerTools.some((t) => t.function.name === "host_escape")).toBe(false);
    expect(providerTools.some((t) => t.function.name === "browser_navigate")).toBe(true);
  });

  it("assigns the documented permission level to browser_navigate", () => {
    expect(getPermissionLevel("browser_navigate")).toBe("approval_required");
    expect(getPermissionLevel("browser_screenshot")).toBe("read_only");
  });
});

describe("tool executor", () => {
  let sandbox: SandboxRuntime;

  beforeAll(async () => {
    const user = store.createUser({ email: `${userId}@example.com`, name: "Tool Tester", id: userId });
    const project = store.createProject({ name: "Tools", userId: user.id });
    sandbox = await getSandboxManager().ensure(user.id, project.id);
  });

  it("refuses always-blocked tools without touching the sandbox", async () => {
    const result = await executeTool("host_escape", {}, { userId, sandbox, autoApprove: true });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/blocked/i);
    expect(result.permissionLevel).toBe("always_blocked");
  });

  it("rejects unknown tools", async () => {
    await expect(executeTool("not_a_tool", {}, { userId, sandbox })).rejects.toThrow(/not available/i);
  });

  it("runs read-only tools immediately and records them in the audit log", async () => {
    const before = store.listAuditLogs({ userId, limit: 500 }).length;
    const result = await executeTool("file_list", { path: "." }, { userId, sandbox });
    expect(result.ok).toBe(true);

    const after = store.listAuditLogs({ userId, limit: 500 });
    expect(after.length).toBeGreaterThan(before);
    expect(after.some((log) => log.action === "tool.completed")).toBe(true);
  });

  it("writes and reads files through the sandbox", async () => {
    const write = await executeTool(
      "file_write",
      { path: "./tool-test.txt", content: "written by the executor" },
      { userId, sandbox, autoApprove: true }
    );
    expect(write.ok).toBe(true);

    const read = await executeTool("file_read", { path: "./tool-test.txt" }, { userId, sandbox });
    expect(read.ok).toBe(true);
    expect(read.output).toBe("written by the executor");
  });

  it("runs shell commands and blocks dangerous ones", async () => {
    const ok = await executeTool(
      "terminal_exec",
      { command: "echo executor-ok" },
      { userId, sandbox, autoApprove: true }
    );
    expect(ok.ok).toBe(true);
    expect(ok.output).toContain("executor-ok");

    const blocked = await executeTool(
      "terminal_exec",
      { command: "shutdown -h now" },
      { userId, sandbox, autoApprove: true }
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/policy/i);
  });

  it("runs python code", async () => {
    const result = await executeTool(
      "code_run",
      { language: "python", code: "print(6*7)" },
      { userId, sandbox, autoApprove: true }
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("42");
  });

  it("queues approval-required tools and executes them only after approval", async () => {
    let approvalId: string | null = null;
    const pending = executeTool(
      "file_write",
      { path: "./gated.txt", content: "approved content" },
      {
        userId,
        sandbox,
        onApprovalRequired: (approval) => {
          approvalId = approval.id;
        },
      }
    );

    // Wait for the approval to be registered, then approve it.
    for (let i = 0; i < 40 && !approvalId; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(approvalId).toBeTruthy();
    expect(store.getApproval(approvalId!)?.status).toBe("PENDING");
    expect(decideApproval(approvalId!, "approve", { userId })?.deliveredToWaitingAgent).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.approvalId).toBe(approvalId);
    expect(store.getApproval(approvalId!)?.status).toBe("APPROVED");

    const read = await executeTool("file_read", { path: "./gated.txt" }, { userId, sandbox });
    expect(read.output).toBe("approved content");
  });

  it("does not execute a rejected tool", async () => {
    let approvalId: string | null = null;
    const pending = executeTool(
      "file_write",
      { path: "./rejected.txt", content: "should never exist" },
      {
        userId,
        sandbox,
        onApprovalRequired: (approval) => {
          approvalId = approval.id;
        },
      }
    );

    for (let i = 0; i < 40 && !approvalId; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    decideApproval(approvalId!, "reject", { userId });

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejected/i);

    const read = await executeTool("file_read", { path: "./rejected.txt" }, { userId, sandbox });
    expect(read.ok).toBe(false);
  });

  it("redacts secret-looking arguments in the audit trail", async () => {
    await executeTool(
      "file_write",
      { path: "./secret.txt", content: "ok", apiKey: "sk-super-secret-value" },
      { userId, sandbox, autoApprove: true }
    );
    const logs = store.listAuditLogs({ userId, limit: 50, action: "tool.completed" });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("sk-super-secret-value");
  });
});
