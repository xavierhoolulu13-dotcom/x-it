"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useChatStore, type ChatMessage, type UiToolCall } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { ChatMessage as ChatMessageView } from "./chat-message";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";

export function ChatInterface() {
  const {
    messages,
    activeConversationId,
    setMessages,
    appendMessage,
    updateMessage,
    isStreaming,
    setIsStreaming,
    upsertConversation,
    conversations,
    activeModel,
  } = useChatStore();
  const { setStatus, emergencyStop, activeProjectId } = useUIStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Load history whenever the selected conversation changes.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeConversationId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setMessages(
          (data.messages || []).map(
            (m: {
              id: string;
              role: ChatMessage["role"];
              content: string;
              createdAt: string;
              metadata?: { demoMode?: boolean };
              toolCalls?: {
                id: string;
                toolName: string;
                arguments: Record<string, unknown>;
                status: string;
                result?: string | null;
                error?: string | null;
                permissionLevel: string;
                approvalId?: string | null;
                duration?: number | null;
              }[];
            }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              demoMode: m.metadata?.demoMode,
              toolCalls: (m.toolCalls || []).map((t) => ({
                id: t.id,
                toolName: t.toolName,
                arguments: t.arguments,
                status: mapStatus(t.status),
                permissionLevel: t.permissionLevel,
                output: t.result || undefined,
                error: t.error || undefined,
                durationMs: t.duration ?? undefined,
                approvalId: t.approvalId ?? undefined,
              })),
            })
          )
        );
      } catch {
        /* keep current messages on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatus("idle");
    toast.info("Stopped");
  };

  const handleSend = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    if (emergencyStop) {
      toast.error("Emergency stop is active — press Resume to continue");
      return;
    }

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content,
      createdAt: now,
    };
    appendMessage(userMessage);

    const assistantId = `local-assistant-${Date.now()}`;
    appendMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: now,
      isStreaming: true,
      toolCalls: [],
    });

    setIsStreaming(true);
    setStatus("thinking");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: activeConversationId || undefined,
          projectId: activeProjectId || undefined,
          model: activeModel || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Stream failed (${response.status}) ${detail.slice(0, 200)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      const applyToolCall = (patch: Partial<UiToolCall> & { toolName: string }) => {
        const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
        const existing = current?.toolCalls || [];
        const index = patch.id ? existing.findIndex((t) => t.id === patch.id || t.refId === patch.id) : -1;
        let next: UiToolCall[];
        if (index >= 0) {
          next = existing.map((t, i) => (i === index ? { ...t, ...patch } : t));
        } else {
          next = [
            ...existing,
            {
              id: patch.id || `pending-${existing.length}-${Date.now()}`,
              arguments: {},
              status: "pending",
              ...patch,
              toolName: patch.toolName,
            } as UiToolCall,
          ];
        }
        updateMessage(assistantId, { toolCalls: next });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          switch (event.type) {
            case "conversation": {
              const id = event.conversationId as string;
              if (id && id !== activeConversationId) {
                useChatStore.getState().setActiveConversation(id);
              }
              if (id) {
                upsertConversation({
                  id,
                  title: (event.title as string) || "Conversation",
                  projectId: (event.projectId as string) || activeProjectId || "",
                  updatedAt: new Date().toISOString(),
                });
              }
              break;
            }
            case "status": {
              setStatus((event.status as never) || "thinking");
              break;
            }
            case "text": {
              text += event.content as string;
              updateMessage(assistantId, { content: text });
              break;
            }
            case "tool_call": {
              applyToolCall({
                id: event.id as string,
                refId: event.id as string,
                toolName: event.toolName as string,
                arguments: (event.arguments as Record<string, unknown>) || {},
                status: "running",
                reason: event.reason as string | undefined,
              });
              break;
            }
            case "approval_required": {
              applyToolCall({
                id: event.toolCallId as string,
                refId: event.toolCallId as string,
                toolName: event.toolName as string,
                arguments: (event.arguments as Record<string, unknown>) || {},
                status: "waiting_approval",
                approvalId: event.approvalId as string,
                reason: event.reason as string | undefined,
              });
              toast.warning(`Approval needed: ${event.toolName}`);
              break;
            }
            case "tool_result": {
              applyToolCall({
                id: event.toolCallId as string,
                refId: event.toolCallRef as string,
                toolName: event.toolName as string,
                status: event.ok ? "completed" : "failed",
                output: event.output as string,
                error: event.error as string | undefined,
                screenshot: event.screenshot as string | undefined,
                screenshotFormat: event.screenshotFormat as "png" | "jpeg" | undefined,
                previewUrl: event.previewUrl as string | undefined,
                durationMs: event.durationMs as number,
              });
              break;
            }
            case "message": {
              // Server-side id replaces the local placeholder.
              const serverId = event.messageId as string;
              if (serverId) {
                const current = useChatStore.getState().messages;
                const assistant = current.find((m) => m.id === assistantId);
                if (assistant) {
                  updateMessage(assistantId, { content: (event.content as string) || assistant.content });
                }
              }
              break;
            }
            case "error": {
              toast.error(String(event.error));
              break;
            }
            default:
              break;
          }
        }
      }

      updateMessage(assistantId, { isStreaming: false });
      setStatus("idle");

      // Refresh persisted history so tool cards match the database exactly.
      const id = useChatStore.getState().activeConversationId;
      if (id) {
        const res = await fetch(`/api/conversations/${id}`).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            // keep the streamed assistant message; only adopt server ids
            const last = data.messages[data.messages.length - 1];
            if (last?.role === "assistant") {
              updateMessage(assistantId, { id: last.id, createdAt: last.createdAt });
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Failed to reach the assistant";
      updateMessage(assistantId, { content: `**Error:** ${message}`, isStreaming: false });
      setStatus("failed");
      toast.error(message);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  if (messages.length === 0) {
    return <WelcomeScreen onSend={handleSend} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {messages.map((message) => (
            <ChatMessageView key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto max-w-4xl">
          <ChatInput onSend={handleSend} disabled={isStreaming} onStop={handleStop} />
          {conversations.length === 0 && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Sending a message creates a conversation in the active project.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function mapStatus(status: string): UiToolCall["status"] {
  switch (status) {
    case "PENDING":
      return "waiting_approval";
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "REJECTED":
    case "CANCELLED":
      return "rejected";
    default:
      return "pending";
  }
}

export default ChatInterface;
