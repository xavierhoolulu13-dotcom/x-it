import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { store, DEMO_PROJECT_ID } from "@/lib/db/store";
import { requireAuth, UnauthorizedError } from "@/lib/auth/session";
import { resolveProvider, type AIMessage } from "@/lib/ai/provider-adapter";
import { toProviderTools } from "@/lib/tools/tool-definitions";
import { executeTool } from "@/lib/tools/executor";
import { getSandboxManager, type SandboxRuntime } from "@/lib/sandbox/manager";
import { getBrowserEngine } from "@/lib/browser/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  message: z.string().min(1).max(20_000),
  conversationId: z.string().optional(),
  projectId: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(32_000).optional(),
  systemPrompt: z.string().max(8000).optional(),
  autoApprove: z.boolean().optional(),
  maxSteps: z.number().int().min(1).max(12).optional(),
});

const DEFAULT_SYSTEM_PROMPT = `You are X-IT, a personal AI computer assistant running inside a web workspace.

You have real tools:
- file_read / file_write / file_delete / file_list — operate on the sandbox workspace
- terminal_exec — run shell commands in the sandbox
- code_run — run python / javascript / typescript / bash / ruby snippets
- browser_navigate / browser_action / browser_screenshot / browser_extract — drive a real headless Chromium browser
- search_web — search from that browser
- server_start / server_stop — run long-lived processes and get a preview URL
- snapshot_create — checkpoint the workspace

Rules:
1. Do the work with tools instead of describing it. Never claim a file was written or a page was opened unless a tool call confirms it.
2. Sensitive actions (writing files, running commands, driving the browser) require user approval — that is handled for you; just call the tool.
3. Read tool output before responding. Report real results, including errors, plainly and briefly.
4. Prefer relative paths inside the workspace (e.g. ./index.html).`;

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireAuth(req);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;

  // ---------------------------------------------------------------- context
  let project = input.projectId ? store.getProject(input.projectId) : undefined;
  if (!project) {
    project =
      store.listProjects(ctx.userId)[0] ||
      store.getProject(DEMO_PROJECT_ID) ||
      store.createProject({ name: "Default Project", userId: ctx.userId });
  }

  let conversation = input.conversationId ? store.getConversation(input.conversationId) : undefined;
  if (conversation && conversation.userId !== ctx.userId && ctx.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!conversation) {
    conversation = store.createConversation({
      title: input.message.slice(0, 60),
      projectId: project.id,
      userId: ctx.userId,
      modelId: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      systemPrompt: project.systemPrompt,
    });
  }

  // Persist the user's message immediately so history survives reloads.
  store.createMessage({
    conversationId: conversation.id,
    role: "user",
    content: input.message,
    userId: ctx.userId,
  });

  const { provider, model, demoMode } = resolveProvider(input.model || conversation.modelId);

  // Sandbox + browser are shared across the tool loop.
  let sandbox: SandboxRuntime | null = null;
  try {
    sandbox = await getSandboxManager().ensure(ctx.userId, project.id);
  } catch (error) {
    console.error("[chat] sandbox unavailable:", error instanceof Error ? error.message : error);
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        send({
          type: "conversation",
          conversationId: conversation!.id,
          title: conversation!.title,
          projectId: project!.id,
        });
        send({ type: "status", status: "thinking", model, provider: provider.name, demoMode });

        const history: AIMessage[] = store
          .listMessages(conversation!.id)
          .slice(-40)
          .map((m) => ({ role: m.role, content: m.content }) as AIMessage);

        const systemPrompt =
          input.systemPrompt || conversation!.systemPrompt || project!.systemPrompt || DEFAULT_SYSTEM_PROMPT;

        const messages: AIMessage[] = [{ role: "system", content: systemPrompt }, ...history];
        const tools = toProviderTools();
        const maxSteps = input.maxSteps ?? 6;
        let fullText = "";
        const executedCalls: { id: string; toolName: string; ok: boolean; output: string }[] = [];
        const toolCallIds: string[] = [];

        for (let step = 0; step < maxSteps; step++) {
          if (abortController.signal.aborted) break;

          const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
          let stepText = "";

          for await (const chunk of provider.chat({
            model,
            messages,
            tools,
            temperature: input.temperature ?? conversation!.temperature,
            maxTokens: input.maxTokens ?? conversation!.maxTokens,
            signal: abortController.signal,
          })) {
            if (chunk.type === "text" && chunk.content) {
              stepText += chunk.content;
              fullText += chunk.content;
              send({ type: "text", content: chunk.content });
            } else if (chunk.type === "status" && chunk.status) {
              send({ type: "status", status: chunk.status });
            } else if (chunk.type === "tool_call" && chunk.toolCall) {
              const call = chunk.toolCall;
              let args: Record<string, unknown> = {};
              try {
                args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
              } catch {
                args = { _raw: call.function.arguments };
              }
              toolCalls.push({ id: call.id, name: call.function.name, args });
            } else if (chunk.type === "error" && chunk.error) {
              send({ type: "error", error: chunk.error });
            }
          }

          // No tool calls → this was the final answer.
          if (toolCalls.length === 0) break;

          messages.push({
            role: "assistant",
            content: stepText,
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          });

          for (const call of toolCalls) {
            if (abortController.signal.aborted) break;
            send({ type: "status", status: "running" });

            const result = await executeTool(call.name, call.args, {
              userId: ctx.userId,
              conversationId: conversation!.id,
              projectId: project!.id,
              sandbox,
              autoApprove: input.autoApprove === true,
              onApprovalRequired: (approval) => {
                send({
                  type: "approval_required",
                  approvalId: approval.id,
                  toolCallId: approval.toolCallId,
                  toolName: approval.toolName,
                  arguments: approval.arguments,
                  reason: approval.reason,
                  expiresAt: approval.expiresAt,
                });
                send({ type: "status", status: "waiting" });
              },
            });

            toolCallIds.push(result.toolCallId);
            executedCalls.push({
              id: result.toolCallId,
              toolName: call.name,
              ok: result.ok,
              output: result.output.slice(0, 4000),
            });

            send({
              type: "tool_result",
              toolCallId: result.toolCallId,
              toolCallRef: call.id,
              toolName: call.name,
              ok: result.ok,
              output: result.output.slice(0, 8000),
              error: result.error,
              screenshot: result.screenshot,
              screenshotFormat: result.screenshotFormat,
              previewUrl: result.previewUrl,
              sandboxId: result.sandboxId,
              browserSessionId: result.browserSessionId,
              durationMs: result.durationMs,
              permissionLevel: result.permissionLevel,
            });

            if (result.previewUrl) {
              send({ type: "preview", url: result.previewUrl, sandboxId: result.sandboxId });
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.name,
              content: result.output.slice(0, 20_000),
            });
          }

          send({ type: "status", status: "thinking" });
        }

        // Attach every tool call from this turn to the assistant message so the
        // UI and the API can render them together after a reload.
        for (const id of toolCallIds) {
          store.updateToolCall(id, { messageId: undefined, conversationId: conversation!.id });
        }

        const assistantMessage = store.createMessage({
          conversationId: conversation!.id,
          role: "assistant",
          content: fullText,
          modelId: demoMode ? "x-it-demo-agent" : model,
          metadata: { toolCalls: executedCalls, demoMode },
        });

        for (const id of toolCallIds) {
          store.updateToolCall(id, { messageId: assistantMessage.id });
        }

        send({ type: "message", messageId: assistantMessage.id, content: fullText });
        send({ type: "status", status: "completed" });
        finish();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Streaming failed";
        console.error("[chat] stream error:", message);
        send({ type: "error", error: message });
        send({ type: "status", status: "failed" });
        finish();
      }
    },
    cancel() {
      abortController.abort();
      void getBrowserEngine().closeAll();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
