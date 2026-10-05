"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore, type Message } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";
import { v4 as uuidv4 } from "uuid";

export function ChatInterface() {
  const {
    conversations,
    activeConversationId,
    addConversation,
    addMessage,
    updateMessage,
    isStreaming,
    setIsStreaming,
  } = useChatStore();
  const { setStatus, emergencyStop } = useUIStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages.length, scrollToBottom]);

  const handleSend = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    let convId = activeConversationId;

    // Create conversation if none exists
    if (!convId) {
      convId = `conv-${Date.now()}`;
      addConversation({
        id: convId,
        title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
        projectId: "default",
        messages: [],
        temperature: 0.7,
        maxTokens: 4096,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };
    addMessage(convId, userMessage);

    // Create assistant message placeholder
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    addMessage(convId, assistantMessage);

    // Start streaming
    setIsStreaming(true);
    setStatus("thinking");

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: content,
          model: useUIStore.getState().selectedModel,
          temperature: activeConversation?.temperature ?? 0.7,
          maxTokens: activeConversation?.maxTokens ?? 4096,
          systemPrompt: activeConversation?.systemPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        if (emergencyStop) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "text") {
                fullContent += parsed.content;
                updateMessage(convId!, assistantMessageId, {
                  content: fullContent,
                });
              } else if (parsed.type === "tool_call") {
                // Add tool call to the message
                const currentMsg = useChatStore
                  .getState()
                  .conversations.find((c) => c.id === convId)
                  ?.messages.find((m) => m.id === assistantMessageId);

                updateMessage(convId!, assistantMessageId, {
                  toolCalls: [
                    ...(currentMsg?.toolCalls || []),
                    {
                      id: parsed.id || uuidv4(),
                      toolName: parsed.toolName,
                      arguments: parsed.arguments,
                      status: "pending" as const,
                      reason: parsed.reason,
                    },
                  ],
                });
                setStatus("waiting");
              } else if (parsed.type === "tool_result") {
                // Update tool call result
                const currentMsg = useChatStore
                  .getState()
                  .conversations.find((c) => c.id === convId)
                  ?.messages.find((m) => m.id === assistantMessageId);

                if (currentMsg?.toolCalls) {
                  updateMessage(convId!, assistantMessageId, {
                    toolCalls: currentMsg.toolCalls.map((tc) =>
                      tc.id === parsed.toolCallId
                        ? {
                            ...tc,
                            result: parsed.result,
                            error: parsed.error,
                            status: parsed.error ? "failed" : "completed",
                            completedAt: new Date(),
                          }
                        : tc
                    ),
                  });
                }
                setStatus("running");
              } else if (parsed.type === "status") {
                setStatus(parsed.status);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Mark streaming as done
      updateMessage(convId!, assistantMessageId, {
        isStreaming: false,
      });
    } catch (error) {
      console.error("Streaming error:", error);
      updateMessage(convId!, assistantMessageId, {
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        isStreaming: false,
      });
      setStatus("failed");
    } finally {
      setIsStreaming(false);
      if (useUIStore.getState().status !== "failed") {
        setStatus("idle");
      }
    }
  };

  if (!mounted) return null;

  if (!activeConversation || activeConversation.messages.length === 0) {
    return <WelcomeScreen onSend={handleSend} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {activeConversation.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto max-w-4xl">
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}