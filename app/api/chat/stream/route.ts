import { NextRequest, NextResponse } from "next/server";

// Simulated AI streaming endpoint
// In production, this connects to the AI provider adapter layer
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, model, temperature, maxTokens } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Simulate AI thinking
        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent({ type: "status", status: "thinking" });

        // Simulate delay
        await new Promise((r) => setTimeout(r, 500));

        // Check if message looks like it needs tool use
        const needsTools = detectToolNeeds(message);

        if (needsTools.length > 0) {
          // Send tool call events
          for (const tool of needsTools) {
            sendEvent({
              type: "tool_call",
              id: `tc-${Date.now()}`,
              toolName: tool.name,
              arguments: tool.args,
              reason: tool.reason,
            });

            sendEvent({ type: "status", status: "waiting" });
            await new Promise((r) => setTimeout(r, 1000));

            sendEvent({
              type: "tool_result",
              toolCallId: `tc-${Date.now() - 1}`,
              result: tool.mockResult,
            });

            sendEvent({ type: "status", status: "running" });
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        // Generate and stream the response text
        const response = generateResponse(message, needsTools);
        const words = response.split(" ");

        for (let i = 0; i < words.length; i++) {
          const chunk = i === 0 ? words[i] : " " + words[i];
          sendEvent({ type: "text", content: chunk });
          await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));
        }

        sendEvent({ type: "status", status: "completed" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function detectToolNeeds(message: string) {
  const lower = message.toLowerCase();
  const tools: {
    name: string;
    args: Record<string, unknown>;
    reason: string;
    mockResult: string;
  }[] = [];

  if (lower.includes("file") || lower.includes("create") || lower.includes("write")) {
    tools.push({
      name: "file_write",
      args: { path: "/sandbox/project/index.html", content: "<!DOCTYPE html>..." },
      reason: "Creating the requested file in the sandbox",
      mockResult: "File written successfully: /sandbox/project/index.html",
    });
  }

  if (lower.includes("run") || lower.includes("execute") || lower.includes("command")) {
    tools.push({
      name: "terminal_exec",
      args: { command: "echo 'Hello from sandbox'" },
      reason: "Running the requested command in the sandbox",
      mockResult: "Hello from sandbox\n[exit code: 0]",
    });
  }

  if (lower.includes("python") || lower.includes("script")) {
    tools.push({
      name: "code_run",
      args: { language: "python", code: "print('Hello from Python')" },
      reason: "Executing Python code in the sandbox",
      mockResult: "Hello from Python\n[exit code: 0]",
    });
  }

  if (lower.includes("browse") || lower.includes("website") || lower.includes("url")) {
    tools.push({
      name: "browser_navigate",
      args: { url: "https://example.com" },
      reason: "Navigating to the requested URL",
      mockResult: "Navigated to https://example.com - Page loaded successfully",
    });
  }

  if (lower.includes("list") || lower.includes("directory") || lower.includes("folder")) {
    tools.push({
      name: "file_list",
      args: { path: "/sandbox/project" },
      reason: "Listing files in the project directory",
      mockResult: "index.html\ncss/style.css\njs/app.js\nREADME.md",
    });
  }

  return tools;
}

function generateResponse(
  message: string,
  toolsUsed: { name: string; mockResult: string }[]
): string {
  const lower = message.toLowerCase();

  if (toolsUsed.length > 0) {
    const toolSummary = toolsUsed
      .map((t) => `- **${t.name}**: ${t.mockResult}`)
      .join("\n");

    return `I've completed the requested operations using the sandbox environment. Here's a summary of what I did:\n\n${toolSummary}\n\nAll operations were performed inside an isolated sandbox container. The host machine was not affected.\n\nIs there anything else you'd like me to do?`;
  }

  if (lower.includes("hello") || lower.includes("hi")) {
    return "Hello! I'm your AI computer assistant. I can help you with:\n\n- **Write and edit files** in an isolated sandbox\n- **Run code** in Python, JavaScript, and more\n- **Execute shell commands** with your approval\n- **Browse websites** and take screenshots\n- **Build applications** from natural language descriptions\n\nWhat would you like to work on?";
  }

  if (lower.includes("help")) {
    return "Here's what I can do:\n\n### File Operations\n- Create, read, edit, and delete files\n- Organize projects into directories\n\n### Code Execution\n- Run Python, JavaScript, and other languages\n- Install packages (with your approval)\n\n### Terminal\n- Execute shell commands\n- Monitor running processes\n\n### Browser Automation\n- Navigate to websites\n- Take screenshots\n- Extract content\n\n### App Building\n- Generate complete projects from descriptions\n- Provide live previews\n- Version history and rollback\n\nAll actions are performed in an **isolated sandbox** for your safety. I'll always ask for permission before potentially destructive operations.\n\nWhat would you like to do?";
  }

  return `I understand you're asking about: "${message}"\n\nI'm ready to help! To give you the best response, I may need to:\n\n1. Use tools in the sandbox environment\n2. Write or modify files\n3. Execute code or commands\n\nJust let me know what you'd like to accomplish, and I'll create a plan and walk you through it step by step. I'll always ask for your approval before performing any sensitive operations.`;
}