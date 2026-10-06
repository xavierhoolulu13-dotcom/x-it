import { store, type ToolCallRecord } from "@/lib/db/store";
import { getSandboxManager, type SandboxRuntime } from "@/lib/sandbox/manager";
import { getBrowserEngine } from "@/lib/browser/engine";
import { getApprovalBroker } from "@/lib/tools/approval-broker";
import {
  ApprovalRejectedError,
  ApprovalTimeoutError,
  PolicyViolationError,
  ToolNotAllowedError,
} from "@/lib/tools/errors";
import { getToolDefinition, type PermissionLevel } from "@/lib/tools/tool-definitions";
import { checkCommand } from "@/lib/tools/policy";

export interface ToolExecutionContext {
  userId: string;
  conversationId?: string;
  messageId?: string;
  projectId?: string;
  sandbox?: SandboxRuntime | null;
  browserSessionId?: string | null;
  /** Automation mode: skip the approval queue (never enable in production UI). */
  autoApprove?: boolean;
  approvalTimeoutSeconds?: number;
  onApprovalRequired?: (approval: {
    id: string;
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    reason: string;
    expiresAt: string;
  }) => void;
}

export interface ToolExecutionResult {
  toolName: string;
  ok: boolean;
  toolCallId: string;
  approvalId?: string | null;
  permissionLevel: PermissionLevel;
  output: string;
  data?: unknown;
  error?: string;
  durationMs: number;
  screenshot?: string;
  screenshotFormat?: "png" | "jpeg";
  previewUrl?: string;
  sandboxId?: string;
  browserSessionId?: string;
}

interface HandlerResult {
  output: string;
  data?: unknown;
  screenshot?: string;
  screenshotFormat?: "png" | "jpeg";
  previewUrl?: string;
  sandboxId?: string;
  browserSessionId?: string;
}

type Handler = (
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
  sandbox: SandboxRuntime | null
) => Promise<HandlerResult>;

const APPROVAL_TIMEOUT_SECONDS = Number(process.env.APPROVAL_TIMEOUT_SECONDS || 300);

function str(args: Record<string, unknown>, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requireSandbox(sandbox: SandboxRuntime | null): SandboxRuntime {
  if (!sandbox) throw new Error("No sandbox is attached to this conversation");
  return sandbox;
}

/** Resolve (or lazily create) the browser session a tool call should act on. */
async function resolveBrowserSession(ctx: ToolExecutionContext, requested?: string): Promise<string> {
  const engine = getBrowserEngine();
  const wanted = requested || ctx.browserSessionId;
  if (wanted) {
    const session = engine.getSession(wanted);
    if (session) return session.id;
  }
  const sessions = engine.listSessions(ctx.userId);
  if (sessions.length > 0) return sessions[0].id;
  const created = await engine.createSession({ userId: ctx.userId, name: "Agent browser" });
  return created.sessionId;
}

function formatExec(prefix: string, result: { stdout: string; stderr: string; exitCode: number; durationMs: number; timedOut: boolean }): string {
  const parts = [`${prefix} (exit ${result.exitCode} in ${result.durationMs}ms)`];
  if (result.stdout) parts.push(result.stdout);
  if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
  if (result.timedOut) parts.push("⚠️ command timed out and was killed");
  return parts.join("\n");
}

const handleTerminalExec: Handler = async (args, ctx, sandbox) => {
  const runtime = requireSandbox(sandbox);
  const command = str(args, "command");
  if (!command) throw new Error("command is required");

  const violation = checkCommand(command);
  if (violation) throw new PolicyViolationError(violation.rule, violation.detail);

  const result = await getSandboxManager().exec(runtime, command, {
    timeoutSeconds: num(args, "timeout", 30),
  });
  return { output: formatExec(`$ ${command}`, result), data: result, sandboxId: runtime.id };
};

const handlers: Record<string, Handler> = {
  file_read: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const path = str(args, "path");
    const content = await getSandboxManager().readFile(runtime, path);
    return { output: content, data: { path, bytes: content.length }, sandboxId: runtime.id };
  },

  file_write: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const path = str(args, "path");
    const content = str(args, "content");
    await getSandboxManager().writeFile(runtime, path, content);
    return {
      output: `Wrote ${content.length} bytes to ${path}`,
      data: { path, bytes: content.length },
      sandboxId: runtime.id,
    };
  },

  file_delete: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const path = str(args, "path");
    await getSandboxManager().deletePath(runtime, path);
    return { output: `Deleted ${path}`, data: { path }, sandboxId: runtime.id };
  },

  file_list: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const path = str(args, "path", ".");
    const maxDepth = Math.min(num(args, "maxDepth", 1), 4);
    const entries = await getSandboxManager().listFiles(runtime, path, maxDepth);
    const listing = entries
      .map((e) => `${e.type === "directory" ? "d" : "-"} ${e.path} (${e.size}b)`)
      .join("\n");
    return {
      output: listing || "(empty directory)",
      data: entries,
      sandboxId: runtime.id,
    };
  },

  terminal_exec: handleTerminalExec,

  code_run: async (args, ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const language = str(args, "language", "python");
    const code = str(args, "code");
    const timeout = num(args, "timeout", 30);

    const files: Record<string, string> = {
      python: "snippet.py",
      javascript: "snippet.mjs",
      typescript: "snippet.ts",
      bash: "snippet.sh",
      ruby: "snippet.rb",
    };
    const runners: Record<string, string> = {
      python: "python3 snippet.py",
      javascript: "node snippet.mjs",
      typescript: "npx --yes tsx snippet.ts",
      bash: "bash snippet.sh",
      ruby: "ruby snippet.rb",
    };

    const file = files[language] || files.python;
    const runner = runners[language] || runners.python;
    await getSandboxManager().writeFile(runtime, `./.x-it-runs/${file}`, code);
    const result = await getSandboxManager().exec(runtime, `cd .x-it-runs && ${runner}`, {
      timeoutSeconds: timeout,
    });

    return {
      output: formatExec(`${language} ${runner}`, result),
      data: { ...result, language, code },
      sandboxId: runtime.id,
    };
  },

  browser_navigate: async (args, ctx) => {
    const engine = getBrowserEngine();
    const sessionId = await resolveBrowserSession(ctx, str(args, "sessionId") || undefined);
    const state = await engine.navigate(sessionId, str(args, "url"));
    const extract = str(args, "extract", "markdown");
    let content = "";
    if (extract !== "none") {
      const extracted = await engine.content(sessionId, extract === "elements" ? "markdown" : (extract as "markdown" | "text" | "links" | "html"));
      content = extracted.content.slice(0, 8000);
    }
    const title = state.title;
    return {
      output: [
        `Navigated to ${state.url}`,
        title ? `Title: ${title}` : "",
        state.elements.length ? `Interactive elements: ${state.elements.length} (use browser_action to click or type)` : "",
        content ? `\n--- page content ---\n${content}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      data: {
        url: state.url,
        title,
        elements: state.elements.slice(0, 40),
      },
      screenshot: state.screenshot,
      screenshotFormat: state.screenshotFormat,
      browserSessionId: sessionId,
    };
  },

  browser_action: async (args, ctx) => {
    const engine = getBrowserEngine();
    const sessionId = await resolveBrowserSession(ctx, str(args, "sessionId") || undefined);
    const type = str(args, "type", "click");
    const action = buildBrowserAction(type, args);
    const state = await engine.act(sessionId, action);
    const last = state.lastAction;
    return {
      output: [
        `${type} → ${last?.ok ? "ok" : "failed"}: ${last?.detail || ""}`,
        `Now on ${state.url}${state.title ? ` — ${state.title}` : ""}`,
      ].join("\n"),
      data: { url: state.url, title: state.title, elements: state.elements.slice(0, 30) },
      screenshot: state.screenshot,
      screenshotFormat: state.screenshotFormat,
      browserSessionId: sessionId,
    };
  },

  browser_screenshot: async (args, ctx) => {
    const engine = getBrowserEngine();
    const sessionId = await resolveBrowserSession(ctx, str(args, "sessionId") || undefined);
    const shot = await engine.screenshot(sessionId, { fullPage: args.fullPage === true });
    const state = await engine.getState(sessionId, { screenshot: false, elements: false });
    return {
      output: `Screenshot captured (${shot.format}) of ${state.url}`,
      data: { url: state.url, title: state.title, at: shot.at },
      screenshot: shot.base64,
      screenshotFormat: shot.format,
      browserSessionId: sessionId,
    };
  },

  browser_extract: async (args, ctx) => {
    const engine = getBrowserEngine();
    const sessionId = await resolveBrowserSession(ctx, str(args, "sessionId") || undefined);
    const format = str(args, "format", "markdown");

    if (format === "elements") {
      const state = await engine.getState(sessionId, { screenshot: false });
      const listing = state.elements
        .map((el) => `${el.index}. [${el.tag}${el.type ? ` type=${el.type}` : ""}] "${el.text}" — selector: ${el.selector}`)
        .join("\n");
      return {
        output: listing || "(no interactive elements found)",
        data: state.elements,
        browserSessionId: sessionId,
      };
    }

    const extracted = await engine.content(sessionId, format as "markdown" | "text" | "links" | "html");
    return {
      output: extracted.content.slice(0, 20_000) || "(empty page)",
      data: { url: extracted.url, title: extracted.title, format },
      browserSessionId: sessionId,
    };
  },

  browser_close: async (args) => {
    const engine = getBrowserEngine();
    const sessionId = str(args, "sessionId");
    const closed = await engine.close(sessionId);
    return { output: closed ? `Closed browser session ${sessionId}` : `No such session ${sessionId}` };
  },

  server_start: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const command = str(args, "command");
    const violation = checkCommand(command);
    if (violation) throw new PolicyViolationError(violation.rule, violation.detail);
    const server = await getSandboxManager().startServer(runtime, command, num(args, "port", 0) || undefined);
    return {
      output: `Started server (pid ${server.pid}) on port ${server.port}.\nCommand: ${command}\nLogs: ${server.logFile || "(in sandbox)"}`,
      data: server,
      previewUrl: `/api/preview/${runtime.id}/`,
      sandboxId: runtime.id,
    };
  },

  server_stop: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    await getSandboxManager().stopServer(runtime, str(args, "serverId") || undefined);
    return { output: "Server stopped", sandboxId: runtime.id };
  },

  search_web: async (args, ctx) => {
    const engine = getBrowserEngine();
    const query = str(args, "query");
    const sessionId = await resolveBrowserSession(ctx, str(args, "sessionId") || undefined);
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const state = await engine.navigate(sessionId, url);
    const extracted = await engine.content(sessionId, "markdown");
    return {
      output: `Search results for "${query}" (from ${state.url}):\n\n${extracted.content.slice(0, 6000)}`,
      data: { query, url: state.url },
      screenshot: state.screenshot,
      screenshotFormat: state.screenshotFormat,
      browserSessionId: sessionId,
    };
  },

  snapshot_create: async (args, _ctx, sandbox) => {
    const runtime = requireSandbox(sandbox);
    const files = await getSandboxManager().captureFiles(runtime);
    const snapshot = store.createSnapshot({
      projectId: runtime.record.projectId,
      name: str(args, "name", `Snapshot ${new Date().toISOString()}`),
      description: str(args, "description"),
      files,
    });
    return {
      output: `Snapshot "${snapshot.name}" created with ${files.length} files`,
      data: { snapshotId: snapshot.id, files: files.length },
      sandboxId: runtime.id,
    };
  },
};

function buildBrowserAction(type: string, args: Record<string, unknown>) {
  const selector = typeof args.selector === "string" ? args.selector : undefined;
  switch (type) {
    case "click":
      return {
        type: "click" as const,
        selector,
        x: typeof args.x === "number" ? args.x : undefined,
        y: typeof args.y === "number" ? args.y : undefined,
      };
    case "type":
      return {
        type: "type" as const,
        selector,
        text: str(args, "text"),
        submit: args.submit === true,
      };
    case "press":
      return { type: "press" as const, key: str(args, "key", "Enter"), selector };
    case "scroll":
      return {
        type: "scroll" as const,
        selector,
        x: typeof args.x === "number" ? args.x : undefined,
        y: typeof args.y === "number" ? args.y : 600,
      };
    case "hover":
      return { type: "hover" as const, selector: selector || "body" };
    case "select":
      return { type: "select" as const, selector: selector || "", value: str(args, "value") };
    case "wait":
      return { type: "wait" as const, selector, ms: typeof args.ms === "number" ? args.ms : undefined };
    case "back":
      return { type: "back" as const };
    case "forward":
      return { type: "forward" as const };
    case "reload":
      return { type: "reload" as const };
    case "focus":
      return { type: "focus" as const, selector: selector || "body" };
    default:
      throw new Error(`Unsupported browser action type: ${type}`);
  }
}

/**
 * Execute a tool call, enforcing the three-tier permission model and writing
 * both the tool-call record and the audit entry.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const started = Date.now();
  const definition = getToolDefinition(name);

  if (!definition) {
    throw new ToolNotAllowedError(name);
  }

  const permissionLevel = definition.permissionLevel;
  const manager = getSandboxManager();
  const sandbox = ctx.sandbox ?? null;

  const toolCall: ToolCallRecord = store.createToolCall({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    toolName: name,
    arguments: args,
    permissionLevel,
    sandboxId: sandbox?.id ?? null,
    status: "PENDING",
  });

  const base = {
    toolName: name,
    toolCallId: toolCall.id,
    permissionLevel,
  };

  // Tier 3: never allowed.
  if (permissionLevel === "always_blocked") {
    const error = `'${name}' is blocked by X-IT policy and will never run.`;
    store.updateToolCall(toolCall.id, { status: "REJECTED", error, completedAt: new Date().toISOString() });
    store.addAuditLog({
      userId: ctx.userId,
      action: "tool.blocked",
      resource: "tool_call",
      resourceId: toolCall.id,
      details: { toolName: name, args },
    });
    return { ...base, ok: false, error, output: error, durationMs: Date.now() - started };
  }

  // Tier 1/2: approval gate.
  let approvalId: string | null = null;
  if (permissionLevel === "approval_required" && !ctx.autoApprove && process.env.X_IT_AUTO_APPROVE !== "true") {
    const approval = store.createApproval({
      toolCallId: toolCall.id,
      userId: ctx.userId,
      toolName: name,
      arguments: args,
      reason: summarizeReason(name, args),
      ttlSeconds: ctx.approvalTimeoutSeconds || APPROVAL_TIMEOUT_SECONDS,
    });
    approvalId = approval.id;
    store.updateToolCall(toolCall.id, { approvalId, status: "PENDING" });

    ctx.onApprovalRequired?.({
      id: approval.id,
      toolCallId: toolCall.id,
      toolName: name,
      arguments: args,
      reason: approval.reason,
      expiresAt: approval.expiresAt,
    });

    try {
      await getApprovalBroker().wait(
        approval.id,
        name,
        ctx.approvalTimeoutSeconds || APPROVAL_TIMEOUT_SECONDS
      );
    } catch (error) {
      const message =
        error instanceof ApprovalRejectedError || error instanceof ApprovalTimeoutError
          ? error.message
          : "Approval was not granted";
      store.updateToolCall(toolCall.id, {
        status: error instanceof ApprovalTimeoutError ? "FAILED" : "REJECTED",
        error: message,
        completedAt: new Date().toISOString(),
      });
      store.addAuditLog({
        userId: ctx.userId,
        action: "tool.approval_denied",
        resource: "tool_call",
        resourceId: toolCall.id,
        details: { toolName: name, message },
      });
      return { ...base, ok: false, error: message, output: message, approvalId, durationMs: Date.now() - started };
    }
  }

  const handler = handlers[name];
  if (!handler) {
    const error = `Tool '${name}' has no handler implementation`;
    store.updateToolCall(toolCall.id, { status: "FAILED", error, completedAt: new Date().toISOString() });
    return { ...base, ok: false, error, output: error, approvalId, durationMs: Date.now() - started };
  }

  store.updateToolCall(toolCall.id, { status: "RUNNING", startedAt: new Date().toISOString(), approvalId });

  try {
    const result = await handler(args, ctx, sandbox);
    const durationMs = Date.now() - started;
    store.updateToolCall(toolCall.id, {
      status: "COMPLETED",
      result: result.output.slice(0, 50_000),
      completedAt: new Date().toISOString(),
      duration: durationMs,
    });
    store.addAuditLog({
      userId: ctx.userId,
      action: "tool.completed",
      resource: "tool_call",
      resourceId: toolCall.id,
      details: {
        toolName: name,
        args: sanitizeArgs(args),
        durationMs,
        sandboxId: result.sandboxId ?? sandbox?.id ?? null,
      },
    });
    if (result.previewUrl || result.sandboxId) {
      store.updateToolCall(toolCall.id, { sandboxId: result.sandboxId ?? sandbox?.id ?? null });
    }
    return {
      ...base,
      ok: true,
      output: result.output,
      data: result.data,
      screenshot: result.screenshot,
      screenshotFormat: result.screenshotFormat,
      previewUrl: result.previewUrl,
      sandboxId: result.sandboxId ?? sandbox?.id,
      browserSessionId: result.browserSessionId,
      approvalId,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    store.updateToolCall(toolCall.id, {
      status: "FAILED",
      error: message,
      completedAt: new Date().toISOString(),
      duration: durationMs,
    });
    store.addAuditLog({
      userId: ctx.userId,
      action: "tool.failed",
      resource: "tool_call",
      resourceId: toolCall.id,
      details: { toolName: name, error: message, args: sanitizeArgs(args) },
    });
    return { ...base, ok: false, error: message, output: `Error: ${message}`, approvalId, durationMs };
  } finally {
    void manager;
  }
}

function summarizeReason(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "terminal_exec":
      return `Run shell command: ${String(args.command || "").slice(0, 140)}`;
    case "file_write":
      return `Write file ${args.path}`;
    case "file_delete":
      return `Delete ${args.path}`;
    case "browser_navigate":
      return `Open ${args.url}`;
    case "browser_action":
      return `Browser ${args.type} on ${args.selector || args.text || args.url || "page"}`;
    case "server_start":
      return `Start server: ${String(args.command || "").slice(0, 120)}`;
    case "package_install":
      return `Install packages: ${String(args.packages || "")}`;
    default:
      return `${name} ${JSON.stringify(sanitizeArgs(args)).slice(0, 120)}`;
  }
}

/** Never persist secret-looking values into the audit trail. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/token|secret|password|key/i.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 2000) {
      out[key] = `${value.slice(0, 500)}… [${value.length - 500} more chars]`;
    } else {
      out[key] = value;
    }
  }
  return out;
}
