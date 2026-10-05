"use client";

import { type Message } from "@/lib/stores/chat-store";
import { ToolCallCard } from "./tool-call-card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`message-enter group mb-6 ${isUser ? "flex justify-end" : ""}`}>
      <div className={`flex gap-3 ${isUser ? "max-w-[80%] flex-row-reverse" : "w-full"}`}>
        {/* Avatar */}
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>

        {/* Content */}
        <div className={`flex-1 ${isUser ? "text-right" : ""}`}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium">
              {isUser ? "You" : "AI Assistant"}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-3 space-y-2">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Message Content */}
          {message.content && (
            <div
              className={`group/msg relative rounded-lg p-3 text-sm ${
                isUser
                  ? "bg-primary text-primary-foreground inline-block"
                  : "bg-secondary/50"
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline = !match;
                        if (isInline) {
                          return (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props}>
                              {children}
                            </code>
                          );
                        }
                        return (
                          <div className="relative">
                            <div className="flex items-center justify-between rounded-t-md bg-muted/80 px-4 py-1.5 text-xs">
                              <span>{match[1]}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(String(children));
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                Copy
                              </button>
                            </div>
                            <pre className="!mt-0 rounded-t-none">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          </div>
                        );
                      },
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto">
                            <table className="min-w-full">{children}</table>
                          </div>
                        );
                      },
                      a({ href, children }) {
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Copy button */}
              {!isUser && (
                <button
                  onClick={handleCopy}
                  className="absolute right-2 top-2 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}

              {/* Streaming indicator */}
              {message.isStreaming && (
                <span className="ml-1 inline-block animate-pulse">▊</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}