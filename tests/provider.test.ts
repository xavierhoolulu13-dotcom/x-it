import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DemoProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  availableModels,
  resolveProvider,
  type AIStreamChunk,
} from "@/lib/ai/provider-adapter";

async function collect(generator: AsyncGenerator<AIStreamChunk>) {
  const chunks: AIStreamChunk[] = [];
  for await (const chunk of generator) chunks.push(chunk);
  return chunks;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo provider (offline agent)", () => {
  const provider = new DemoProvider();

  it("plans a file write from natural language", async () => {
    const chunks = await collect(
      provider.chat({
        model: "x-it-demo-agent",
        messages: [{ role: "user", content: "create a file index.html with a landing page" }],
      })
    );
    const calls = chunks.filter((c) => c.type === "tool_call");
    expect(calls.length).toBe(1);
    const parsed = JSON.parse((calls[0].toolCall as { function: { arguments: string } }).function.arguments);
    expect(parsed.path).toBe("./index.html");
    expect(parsed.content).toContain("<!DOCTYPE html>");
    expect(parsed.content).toContain("landing page");
  });

  it("plans multiple tool calls and strips trailing instructions from file content", async () => {
    const chunks = await collect(
      provider.chat({
        model: "x-it-demo-agent",
        messages: [
          {
            role: "user",
            content:
              "create a file ./notes.txt with the text 'hello there' and then run the shell command 'ls -la'",
          },
        ],
      })
    );
    const calls = chunks.filter((c) => c.type === "tool_call");
    const names = calls.map((c) => (c.toolCall as { function: { name: string } }).function.name);
    expect(names).toContain("file_write");
    expect(names).toContain("terminal_exec");

    const write = calls.find(
      (c) => (c.toolCall as { function: { name: string } }).function.name === "file_write"
    );
    const args = JSON.parse((write!.toolCall as { function: { arguments: string } }).function.arguments);
    expect(args.content).toBe("hello there");
  });

  it("plans browser navigation for URLs", async () => {
    const chunks = await collect(
      provider.chat({
        model: "x-it-demo-agent",
        messages: [{ role: "user", content: "open https://example.com and take a screenshot" }],
      })
    );
    const names = chunks
      .filter((c) => c.type === "tool_call")
      .map((c) => (c.toolCall as { function: { name: string } }).function.name);
    expect(names).toContain("browser_navigate");
    expect(names).toContain("browser_screenshot");
  });

  it("explains itself when it cannot help", async () => {
    const chunks = await collect(
      provider.chat({ model: "demo", messages: [{ role: "user", content: "explain quantum field theory" }] })
    );
    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => c.content as string)
      .join("");
    expect(text).toMatch(/demo mode/i);
    expect(text).toMatch(/OPENAI_API_KEY/);
  });

  it("summarises tool results instead of calling tools again", async () => {
    const chunks = await collect(
      provider.chat({
        model: "demo",
        messages: [
          { role: "user", content: "create a file a.txt" },
          { role: "assistant", content: "", tool_calls: [] },
          { role: "tool", content: "Wrote 12 bytes to ./a.txt", tool_call_id: "1", name: "file_write" },
        ],
      })
    );
    expect(chunks.some((c) => c.type === "tool_call")).toBe(false);
    const text = chunks
      .filter((c) => c.type === "text")
      .map((c) => c.content as string)
      .join("");
    expect(text).toMatch(/Wrote 12 bytes/);
  });
});

describe("openai-compatible provider", () => {
  it("streams text deltas and assembles tool calls from SSE", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"world"}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"file_write","arguments":"{\\"path\\":\\"./a.txt\\","}}]}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"content\\":\\"hi\\"}"}}]},"finish_reason":"tool_calls"}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }))
    );

    const provider = new OpenAICompatibleProvider("test-key", "https://example.invalid/v1");
    const chunks = await collect(
      provider.chat({ model: "gpt-4o-mini", messages: [{ role: "user", content: "make a file" }] })
    );

    const text = chunks.filter((c) => c.type === "text").map((c) => c.content).join("");
    expect(text).toBe("Hello world");

    const toolCall = chunks.find((c) => c.type === "tool_call")?.toolCall as {
      id: string;
      function: { name: string; arguments: string };
    };
    expect(toolCall.id).toBe("call_1");
    expect(toolCall.function.name).toBe("file_write");
    expect(JSON.parse(toolCall.function.arguments)).toEqual({ path: "./a.txt", content: "hi" });
  });

  it("surfaces provider errors with the response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 401 })));
    const provider = new OpenAICompatibleProvider("nope", "https://example.invalid/v1");
    await expect(collect(provider.chat({ model: "gpt-4o-mini", messages: [] }))).rejects.toThrow(
      /401.*bad key/s
    );
  });
});

describe("ollama provider", () => {
  it("parses NDJSON streaming responses", async () => {
    const ndjson = [
      JSON.stringify({ message: { content: "Local " } }),
      JSON.stringify({ message: { content: "model" } }),
      JSON.stringify({ message: { content: "", tool_calls: [{ function: { name: "file_list", arguments: { path: "." } } }] } }),
      JSON.stringify({ done: true }),
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(ndjson, { status: 200 })));

    const provider = new OllamaProvider("http://127.0.0.1:11434");
    const chunks = await collect(provider.chat({ model: "llama3.1", messages: [] }));

    expect(chunks.filter((c) => c.type === "text").map((c) => c.content).join("")).toBe("Local model");
    const tool = chunks.find((c) => c.type === "tool_call")?.toolCall as {
      function: { name: string; arguments: string };
    };
    expect(tool.function.name).toBe("file_list");
    expect(JSON.parse(tool.function.arguments)).toEqual({ path: "." });
  });
});

describe("provider resolution", () => {
  it("falls back to the demo agent when nothing is configured", () => {
    const resolved = resolveProvider("x-it-demo-agent");
    expect(resolved.provider.name).toBe("demo");
    expect(resolved.demoMode).toBe(true);
  });

  it("always advertises at least one model", () => {
    const models = availableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.demo)).toBe(true);
  });
});
