/**
 * Tool definitions for the AI assistant.
 *
 * Every tool declares a JSON-schema parameter list and a permission level that
 * the executor enforces (read-only runs immediately, approval-required goes
 * through the approval queue, always-blocked is refused outright).
 */

export type PermissionLevel = "read_only" | "approval_required" | "always_blocked";

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  parameters: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "file_read",
    description: "Read the contents of a file in the sandbox workspace. Returns text content.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the sandbox workspace, e.g. ./index.html" } },
      required: ["path"],
    },
  },
  {
    name: "file_write",
    description: "Write or overwrite a file in the sandbox workspace. Creates parent directories automatically.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the sandbox workspace" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "file_delete",
    description: "Delete a file or directory inside the sandbox workspace.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path to delete" } },
      required: ["path"],
    },
  },
  {
    name: "file_list",
    description: "List files and directories in the sandbox workspace.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list (default: workspace root)", default: "." },
        maxDepth: { type: "number", description: "Recursion depth (default 1)", default: 1 },
      },
    },
  },
  {
    name: "terminal_exec",
    description: "Run a shell command inside the sandbox workspace and return stdout/stderr/exit code.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
        timeout: { type: "number", description: "Timeout in seconds (default 30, max 300)", default: 30 },
      },
      required: ["command"],
    },
  },
  {
    name: "code_run",
    description: "Run a code snippet (python, javascript, typescript, bash, ruby) inside the sandbox.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", description: "Language", enum: ["python", "javascript", "typescript", "bash", "ruby"] },
        code: { type: "string", description: "Code to execute" },
        timeout: { type: "number", description: "Timeout in seconds", default: 30 },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "browser_navigate",
    description:
      "Drive the real headless browser: open a URL in the session and return the page title, readable text and a screenshot.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open (https:// prefix optional)" },
        sessionId: { type: "string", description: "Reuse an existing browser session (optional)" },
        extract: { type: "string", description: "What to return", enum: ["markdown", "text", "links", "html", "none"], default: "markdown" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_action",
    description:
      "Interact with the current page: click, type, press keys, scroll, hover, select an option, go back/forward, reload or wait.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Browser session id (defaults to the active session)" },
        type: {
          type: "string",
          description: "Action type",
          enum: ["click", "type", "press", "scroll", "hover", "select", "wait", "back", "forward", "reload", "focus"],
        },
        selector: { type: "string", description: "CSS selector for the target element" },
        text: { type: "string", description: "Text to type (for type actions)" },
        key: { type: "string", description: "Key to press, e.g. Enter (for press actions)" },
        value: { type: "string", description: "Value for select actions" },
        x: { type: "number", description: "X coordinate for coordinate clicks / horizontal scroll" },
        y: { type: "number", description: "Y coordinate for coordinate clicks / vertical scroll" },
        submit: { type: "boolean", description: "Press Enter after typing", default: false },
        ms: { type: "number", description: "Milliseconds to wait (for wait actions)" },
      },
      required: ["type"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot of the current browser page.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Browser session id (optional)" },
        fullPage: { type: "boolean", description: "Capture the entire scrollable page", default: false },
      },
    },
  },
  {
    name: "browser_extract",
    description:
      "Extract structured content from the current page: readable markdown, plain text, links, or the list of interactive elements.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Browser session id (optional)" },
        format: { type: "string", description: "Extraction format", enum: ["markdown", "text", "links", "elements"], default: "markdown" },
      },
    },
  },
  {
    name: "browser_close",
    description: "Close a browser session and release its resources.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: { sessionId: { type: "string", description: "Browser session id" } },
      required: ["sessionId"],
    },
  },
  {
    name: "server_start",
    description:
      "Start a long-running process (dev server, API, static server) in the sandbox and return its preview URL.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to start, e.g. 'npx serve -l $PORT .'" },
        port: { type: "number", description: "Preferred port (optional)" },
      },
      required: ["command"],
    },
  },
  {
    name: "server_stop",
    description: "Stop a running sandbox server.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: { serverId: { type: "string", description: "Server id (omit to stop all)" } },
    },
  },
  {
    name: "search_web",
    description: "Search the web from inside the sandbox browser and return the top results.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "snapshot_create",
    description: "Snapshot the current sandbox files so the user can roll back later.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Snapshot label" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name"],
    },
  },
  {
    name: "host_escape",
    description: "Reserved example of an always-blocked tool — attempts to touch the host machine.",
    permissionLevel: "always_blocked",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "credential_access",
    description: "Reserved example of an always-blocked tool — attempts to read credentials.",
    permissionLevel: "always_blocked",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export const TOOL_MAP: Record<string, ToolDefinition> = Object.fromEntries(
  TOOL_DEFINITIONS.map((tool) => [tool.name, tool])
);

export const AGENT_TOOL_NAMES = [
  "file_read",
  "file_write",
  "file_list",
  "file_delete",
  "terminal_exec",
  "code_run",
  "browser_navigate",
  "browser_action",
  "browser_screenshot",
  "browser_extract",
  "browser_close",
  "server_start",
  "server_stop",
  "search_web",
  "snapshot_create",
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_MAP[name];
}

export function getPermissionLevel(name: string): PermissionLevel | undefined {
  return TOOL_MAP[name]?.permissionLevel;
}

export function isToolName(name: string): boolean {
  return Boolean(TOOL_MAP[name]);
}

/** Convert to OpenAI/Ollama function-calling JSON schema. */
export function toProviderTools(names: string[] = AGENT_TOOL_NAMES) {
  return names
    .map((name) => TOOL_MAP[name])
    .filter((tool): tool is ToolDefinition => Boolean(tool) && tool.permissionLevel !== "always_blocked")
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: `${tool.description} [permission: ${tool.permissionLevel}]`,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
}
