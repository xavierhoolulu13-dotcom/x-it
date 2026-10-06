/**
 * AI Provider Adapter Layer
 *
 * Real streaming implementations for:
 *  - OpenAI-compatible APIs (OpenAI, Azure OpenAI, Groq, OpenRouter, LM Studio…)
 *  - Ollama (local models)
 *  - A built-in deterministic "demo" agent that drives the real tool system when
 *    no API key is configured, so X-IT is never a dead end.
 *
 * No SDK dependency: everything is plain fetch + SSE parsing.
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
  signal?: AbortSignal;
}

export interface AIStreamChunk {
  type: "text" | "tool_call" | "status" | "error" | "done";
  content?: string;
  toolCall?: AIToolCall;
  status?: string;
  error?: string;
  finishReason?: string;
}

export interface AIProvider {
  name: string;
  models: string[];
  isAvailable(): Promise<boolean>;
  chat(options: AIRequestOptions): AsyncGenerator<AIStreamChunk>;
}

// ------------------------------------------------------------------ utilities

async function* parseSse(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
}

function mergeToolCallDelta(accumulator: Map<number, AIToolCall>, delta: {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}) {
  const index = delta.index ?? 0;
  const existing = accumulator.get(index) || {
    id: delta.id || `call_${index}`,
    type: "function" as const,
    function: { name: "", arguments: "" },
  };
  if (delta.id) existing.id = delta.id;
  if (delta.function?.name) existing.function.name += delta.function.name;
  if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
  accumulator.set(index, existing);
}

// ------------------------------------------------------- OpenAI-compatible

export class OpenAICompatibleProvider implements AIProvider {
  name = "openai";
  models: string[];
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl?: string, models?: string[]) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.models = models || [
      process.env.DEFAULT_MODEL || "gpt-4o-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
    ];
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
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
      messages: options.messages.map((m) => {
        if (m.role === "tool") {
          return { role: "tool", content: m.content, tool_call_id: m.tool_call_id, name: m.name };
        }
        if (m.role === "assistant" && m.tool_calls?.length) {
          return { role: "assistant", content: m.content || null, tool_calls: m.tool_calls };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    };
    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Provider error ${response.status}: ${text.slice(0, 400)}`);
    }

    const toolCalls = new Map<number, AIToolCall>();
    let finishReason: string | undefined;

    for await (const event of parseSse(response)) {
      const choices = event.choices as
        | { delta?: { content?: string; tool_calls?: unknown[] }; finish_reason?: string }[]
        | undefined;
      const choice = choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        yield { type: "text", content: choice.delta.content };
      }
      if (Array.isArray(choice.delta?.tool_calls)) {
        for (const raw of choice.delta.tool_calls as never[]) {
          mergeToolCallDelta(toolCalls, raw);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    for (const call of toolCalls.values()) {
      if (call.function.name) yield { type: "tool_call", toolCall: call };
    }
    yield { type: "done", finishReason };
  }
}

// ------------------------------------------------------------------ Ollama

export class OllamaProvider implements AIProvider {
  name = "ollama";
  models: string[];
  private baseUrl: string;

  constructor(baseUrl?: string, models?: string[]) {
    this.baseUrl = (baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
    this.models = models || ["llama3.1", "llama3", "qwen2.5", "mistral", "codellama"];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
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
        model: options.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        })),
        tools: options.tools?.length ? options.tools : undefined,
        stream: true,
        options: { temperature: options.temperature ?? 0.7, num_predict: options.maxTokens ?? 2048 },
      }),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls = new Map<number, AIToolCall>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: {
          message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
          done?: boolean;
        };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.message?.content) yield { type: "text", content: event.message.content };
        if (Array.isArray(event.message?.tool_calls)) {
          event.message.tool_calls.forEach((call, index) => {
            mergeToolCallDelta(toolCalls, {
              index,
              id: `call_${index}`,
              function: {
                name: call.function?.name,
                arguments:
                  typeof call.function?.arguments === "string"
                    ? call.function.arguments
                    : JSON.stringify(call.function?.arguments ?? {}),
              },
            });
          });
        }
      }
    }

    for (const call of toolCalls.values()) {
      if (call.function.name) yield { type: "tool_call", toolCall: call };
    }
    yield { type: "done" };
  }
}

// ------------------------------------------------------------ Demo provider

/**
 * Deterministic offline agent.
 *
 * Used when no provider credentials are configured. It recognises common
 * requests and emits *real* tool calls (files, shell, code, browser), so the
 * sandbox, approval queue and audit trail all behave exactly as they do with a
 * hosted model. It is clearly labelled in the UI as the demo engine.
 */
export class DemoProvider implements AIProvider {
  name = "demo";
  models = ["x-it-demo-agent", "demo"];

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async *chat(options: AIRequestOptions): AsyncGenerator<AIStreamChunk> {
    const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
    const prompt = (lastUser?.content || "").trim();
    const hasToolResult = options.messages.some((m) => m.role === "tool");

    if (hasToolResult) {
      yield { type: "status", status: "writing" };
      const summary = summarizeToolResults(options.messages);
      for (const chunk of chunkText(summary)) {
        yield { type: "text", content: chunk };
        await sleep(12);
      }
      yield { type: "done", finishReason: "stop" };
      return;
    }

    const planned = plan(prompt);
    if (planned.length === 0) {
      const reply =
        `I'm running in demo mode (no AI provider key configured), so I can't reason about arbitrary requests.\n\n` +
        `I *can* really execute these for you — try:\n` +
        `• "create a file index.html with a landing page"\n` +
        `• "run ls -la in the sandbox"\n` +
        `• "run python code to print the first 20 fibonacci numbers"\n` +
        `• "open example.com and take a screenshot"\n` +
        `• "search the web for headless chrome automation"\n\n` +
        `Set OPENAI_API_KEY (or OLLAMA_BASE_URL) in .env to enable full reasoning with tool use.`;
      for (const chunk of chunkText(reply)) {
        yield { type: "text", content: chunk };
        await sleep(10);
      }
      yield { type: "done", finishReason: "stop" };
      return;
    }

    yield { type: "status", status: "planning" };
    for (const [index, call] of planned.entries()) {
      yield {
        type: "tool_call",
        toolCall: {
          id: `demo_call_${index}_${Date.now().toString(36)}`,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        },
      };
      await sleep(60);
    }
    yield { type: "done", finishReason: "tool_calls" };
  }
}

function chunkText(text: string, size = 24): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push((i === 0 ? "" : " ") + words.slice(i, i + size).join(" "));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeToolResults(messages: AIMessage[]): string {
  const results = messages.filter((m) => m.role === "tool");
  const failed = results.filter((m) => /^error/i.test(m.content.trim()) || /exit [1-9]/.test(m.content));
  const lines: string[] = [];

  if (failed.length === 0) {
    lines.push("Done — here's what happened:");
  } else {
    lines.push(`${results.length - failed.length} of ${results.length} steps succeeded.`);
  }

  for (const result of results.slice(-6)) {
    const firstLine = result.content.split("\n").find((l) => l.trim().length > 0) || "(no output)";
    lines.push(`• ${firstLine.slice(0, 160)}`);
  }
  if (failed.length) {
    lines.push("\nFailures are expanded in the tool cards above.");
  }
  return lines.join("\n");
}

interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Intent recognition for the offline agent. */
function plan(prompt: string): PlannedCall[] {
  const calls: PlannedCall[] = [];
  const lower = prompt.toLowerCase();

  const urlMatch = prompt.match(/https?:\/\/[^\s"']+/i);
  const bareDomain = prompt.match(/\b([a-z0-9-]+\.(com|org|net|io|dev|ai|co|app|gov|edu))(\/[^\s"']*)?/i);

  const wantsBrowser =
    /(open|browse|navigate|visit|go to|load|screenshot|search the web|google|search for)/i.test(lower);
  const wantsSearch = /(search the web|search for|google|look up)/i.test(lower);

  const fileWrite = prompt.match(
    /(?:create|write|make|generate)\s+(?:a\s+)?(?:file\s+)?(?:named\s+|called\s+)?([\w./-]+\.[a-z0-9]+)\s*(?:with|containing|that says|:)?\s*([\s\S]*)/i
  );
  // Strip trailing follow-up instructions ("... and then run ls -la") and
  // filler ("the text '...'") so file bodies contain only real content.
  const fileBody = (fileWrite?.[2] || "")
    .trim()
    .replace(/\s*(?:,?\s*(?:and\s+)?then\s+(?:run|execute|start|open|browse|navigate)\b[\s\S]*)$/i, "")
    .replace(/^(?:the\s+)?(?:text|string|content|saying|words?)\s*:?\s*/i, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  const pythonRun = /(run|execute)\s+(?:some\s+)?python/i.test(lower) || /python\s+code/i.test(lower);
  const shellRun =
    prompt.match(/(?:run|execute)\s+(?:the\s+)?(?:shell\s+|terminal\s+)?(?:command\s+)?[`"']([^`"']+)[`"']/i) ||
    prompt.match(/^\s*(ls|pwd|cat|echo|whoami|df|uname|node|python3?)\b.*$/im);

  if (wantsSearch) {
    const query = prompt.replace(/.*(?:search the web for|search for|google|look up)\s*/i, "").trim();
    calls.push({ name: "search_web", arguments: { query: query || prompt } });
  } else if (wantsBrowser && (urlMatch || bareDomain)) {
    const url = urlMatch?.[0] || bareDomain?.[0] || "";
    if (url && !/search_web/.test(lower)) {
      calls.push({ name: "browser_navigate", arguments: { url } });
      if (/screenshot/i.test(lower)) {
        calls.push({ name: "browser_screenshot", arguments: { fullPage: /full page|fullpage/i.test(lower) } });
      }
    }
  }

  if (fileWrite) {
    const path = fileWrite[1].startsWith(".") || fileWrite[1].startsWith("/") ? `./${fileWrite[1].replace(/^\//, "")}` : `./${fileWrite[1]}`;
    const rawContent = fileBody;
    // A short natural-language description ("a landing page") is a request for
    // generated content, not literal file content.
    const looksLikeContent =
      rawContent.length > 0 &&
      (/[<>{}();=#\[\]]/.test(rawContent) || rawContent.includes("\n") || rawContent.length > 160);
    const isMarkupTarget = /\.(html?|svg|jsx?|tsx?|vue)$/i.test(path);
    const content =
      !rawContent || (isMarkupTarget && !looksLikeContent)
        ? buildDefaultContent(path, rawContent)
        : rawContent;

    calls.push({ name: "file_write", arguments: { path, content } });
  } else if (/(list|show|what).*(files|directory|folder)/i.test(lower) || /^ls\b/i.test(prompt.trim())) {
    calls.push({ name: "file_list", arguments: { path: ".", maxDepth: 2 } });
  }

  if (pythonRun) {
    const codeMatch = prompt.match(/```(?:python)?\n?([\s\S]*?)```/);
    const code = codeMatch?.[1]?.trim();
    calls.push({
      name: "code_run",
      arguments: {
        language: "python",
        code: code || "from math import sqrt\nfib=[0,1]\nwhile len(fib)<20: fib.append(fib[-1]+fib[-2])\nprint('first 20 fibonacci:', fib)\nprint('sqrt(2) =', round(sqrt(2),6))",
      },
    });
  }

  if (shellRun && !pythonRun) {
    const command = Array.isArray(shellRun) ? (shellRun[1] || shellRun[0]).trim() : String(shellRun).trim();
    calls.push({ name: "terminal_exec", arguments: { command } });
  }

  if (calls.length === 0 && /(hello|hi|hey|what can you do|help)/i.test(lower)) {
    return [];
  }

  return calls.slice(0, 4);
}

function buildDefaultContent(path: string, description = ""): string {
  if (path.endsWith(".html") || path.endsWith(".htm")) {
    const subtitle = description
      ? description.replace(/^a\s+/i, "").replace(/\.$/, "")
      : "This file was written by the X-IT sandbox agent.";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Built by X-IT</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           font-family: ui-sans-serif, system-ui; background: #0b1020; color: #e8ecf8; }
    .card { padding: 2.5rem 3rem; border-radius: 16px; background: #131a30;
            border: 1px solid #26304d; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
    h1 { margin: 0 0 .5rem; font-size: 1.6rem; }
    p { margin: 0; color: #93a0c0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello from X-IT</h1>
    <p>${subtitle}</p>
  </div>
</body>
</html>`;
  }
  if (path.endsWith(".md")) return `# ${path.replace("./", "")}\n\nCreated by X-IT.\n`;
  if (path.endsWith(".json")) return `${JSON.stringify({ createdBy: "x-it", at: new Date().toISOString() }, null, 2)}\n`;
  return `// ${path.replace("./", "")} — created by X-IT at ${new Date().toISOString()}\n`;
}

// ------------------------------------------------------------------ registry

export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }
}

let registry: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry();
    if (process.env.OPENAI_API_KEY) {
      registry.register(
        new OpenAICompatibleProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL)
      );
    }
    if (process.env.OLLAMA_BASE_URL) {
      registry.register(new OllamaProvider(process.env.OLLAMA_BASE_URL));
    }
    registry.register(new DemoProvider());
  }
  return registry;
}

export interface ResolvedProvider {
  provider: AIProvider;
  model: string;
  demoMode: boolean;
}

export function resolveProvider(requestedModel?: string): ResolvedProvider {
  const reg = getProviderRegistry();
  const model = requestedModel || process.env.DEFAULT_MODEL || "";
  const wantsOllama = model.startsWith("ollama/") || model.startsWith("llama") || model.startsWith("qwen") || model.startsWith("mistral");

  const openai = reg.get("openai");
  const ollama = reg.get("ollama");

  if (wantsOllama && ollama) {
    return { provider: ollama, model: model.replace(/^ollama\//, ""), demoMode: false };
  }
  if (openai) {
    return { provider: openai, model: model || "gpt-4o-mini", demoMode: false };
  }
  if (ollama) {
    return { provider: ollama, model: model || ollama.models[0], demoMode: false };
  }
  return { provider: reg.get("demo") as DemoProvider, model: "x-it-demo-agent", demoMode: true };
}

export function availableModels(): { id: string; name: string; provider: string; demo?: boolean }[] {
  const models: { id: string; name: string; provider: string; demo?: boolean }[] = [];
  const reg = getProviderRegistry();
  const openai = reg.get("openai");
  const ollama = reg.get("ollama");

  if (openai) {
    for (const m of openai.models) models.push({ id: m, name: m, provider: "openai" });
  }
  if (ollama) {
    for (const m of ollama.models) models.push({ id: `ollama/${m}`, name: `${m} (local)`, provider: "ollama" });
  }
  models.push({ id: "x-it-demo-agent", name: "X-IT Demo Agent (no API key)", provider: "demo", demo: true });
  return models;
}
