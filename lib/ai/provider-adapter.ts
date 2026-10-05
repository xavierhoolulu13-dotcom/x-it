/**
 * AI Provider Adapter Layer
 *
 * Supports multiple AI providers through a unified interface:
 * - OpenAI-compatible APIs (OpenAI, Azure OpenAI, etc.)
 * - Ollama-compatible endpoints (local models)
 * - Custom providers
 */

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIRequestOptions {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AITool[];
  stream?: boolean;
}

export interface AIStreamChunk {
  type: "text" | "tool_call" | "status" | "error" | "done";
  content?: string;
  toolCall?: AIToolCall;
  status?: string;
  error?: string;
}

export interface AIProvider {
  name: string;
  models: string[];
  isAvailable(): Promise<boolean>;
  chat(options: AIRequestOptions): AsyncGenerator<AIStreamChunk>;
}

/**
 * OpenAI-compatible provider
 * Works with OpenAI, Azure OpenAI, and any OpenAI-compatible API
 */
export class OpenAICompatibleProvider implements AIProvider {
  name = "openai";
  models: string[];
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || "https://api.openai.com/v1";
    this.models = [
      "gpt-4",
      "gpt-4-turbo",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-3.5-turbo",
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chat(options: AIRequestOptions): AsyncGenerator<AIStreamChunk> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: options.stream ?? true,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: "error", error: `API error (${response.status}): ${error}` };
      return;
    }

    if (!options.stream) {
      const data = await response.json();
      const choice = data.choices?.[0];
      if (choice?.message?.content) {
        yield { type: "text", content: choice.message.content };
      }
      if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          yield { type: "tool_call", toolCall: tc };
        }
      }
      yield { type: "done" };
      return;
    }

    // Stream processing
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            yield { type: "text", content: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: tc.id || "",
                  type: "function",
                  function: {
                    name: tc.function?.name || "",
                    arguments: tc.function?.arguments || "",
                  },
                },
              };
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}

/**
 * Ollama-compatible provider for local models
 */
export class OllamaProvider implements AIProvider {
  name = "ollama";
  models: string[];
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:11434") {
    this.baseUrl = baseUrl;
    this.models = ["llama3", "mistral", "codellama", "phi3"];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chat(options: AIRequestOptions): AsyncGenerator<AIStreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model.replace("ollama/", ""),
        messages: options.messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      yield { type: "error", error: `Ollama error (${response.status})` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield { type: "text", content: parsed.message.content };
          }
          if (parsed.done) {
            yield { type: "done" };
            return;
          }
        } catch {
          // Skip
        }
      }
    }
  }
}

/**
 * Provider registry - manages all available providers
 */
export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();

  register(provider: AIProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(model: string): AIProvider | undefined {
    // Route model to provider
    if (model.startsWith("ollama/")) {
      return this.providers.get("ollama");
    }
    // Default to OpenAI-compatible
    return this.providers.get("openai");
  }

  async getAvailableModels(): Promise<{ provider: string; model: string }[]> {
    const models: { provider: string; model: string }[] = [];
    for (const provider of Array.from(this.providers.values())) {
      if (await provider.isAvailable()) {
        for (const model of provider.models) {
          models.push({ provider: provider.name, model });
        }
      }
    }
    return models;
  }
}

// Singleton
let registry: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry();

    // Register OpenAI provider
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      registry.register(
        new OpenAICompatibleProvider(
          openaiKey,
          process.env.OPENAI_BASE_URL
        )
      );
    }

    // Register Ollama provider
    registry.register(
      new OllamaProvider(process.env.OLLAMA_BASE_URL)
    );
  }
  return registry;
}