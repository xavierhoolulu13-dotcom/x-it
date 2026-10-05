/**
 * Tool definitions for the AI assistant.
 * Each tool has a name, description, parameter schema, and permission level.
 */

export type PermissionLevel = "read_only" | "approval_required" | "always_blocked";

export interface ToolDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "file_read",
    description: "Read the contents of a file in the sandbox. Returns the file content as text.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "file_write",
    description: "Write or overwrite a file in the sandbox. Creates parent directories if needed.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path where the file should be written",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "file_delete",
    description: "Delete a file or directory in the sandbox. This action requires explicit confirmation.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to delete",
        },
        recursive: {
          type: "boolean",
          description: "Whether to delete directories recursively",
          default: false,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "file_list",
    description: "List files and directories in a given path.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list",
        },
        maxDepth: {
          type: "number",
          description: "Maximum depth to recurse (default: 1)",
          default: 1,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "terminal_exec",
    description: "Execute a shell command in the sandbox terminal. Commands run as the sandbox user.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        workingDir: {
          type: "string",
          description: "Working directory for the command",
          default: "/home/sandbox/project",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 30)",
          default: 30,
        },
      },
      required: ["command"],
    },
  },
  {
    name: "code_run",
    description: "Run a code snippet in the specified language. Supports Python, JavaScript, and more.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: "Programming language",
          enum: ["python", "javascript", "typescript", "bash", "ruby"],
        },
        code: {
          type: "string",
          description: "The code to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 30)",
          default: 30,
        },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate the sandbox browser to a URL and return the page content.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to",
        },
        waitFor: {
          type: "string",
          description: "CSS selector to wait for before returning",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page or sandbox desktop.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "What to screenshot: 'browser' or 'desktop'",
          enum: ["browser", "desktop"],
          default: "browser",
        },
        width: {
          type: "number",
          description: "Screenshot width in pixels",
          default: 1280,
        },
        height: {
          type: "number",
          description: "Screenshot height in pixels",
          default: 720,
        },
      },
    },
  },
  {
    name: "package_install",
    description: "Install a package in the sandbox using the appropriate package manager.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        package: {
          type: "string",
          description: "Package name to install",
        },
        manager: {
          type: "string",
          description: "Package manager to use",
          enum: ["npm", "pip", "apt"],
          default: "npm",
        },
        version: {
          type: "string",
          description: "Specific version to install (optional)",
        },
      },
      required: ["package", "manager"],
    },
  },
  {
    name: "server_start",
    description: "Start a development server in the sandbox for previewing applications.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The server start command",
        },
        port: {
          type: "number",
          description: "Port number for the server",
          default: 3000,
        },
        name: {
          type: "string",
          description: "Name for the server process",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "server_stop",
    description: "Stop a running development server in the sandbox.",
    permissionLevel: "approval_required",
    parameters: {
      type: "object",
      properties: {
        processId: {
          type: "string",
          description: "ID of the process to stop",
        },
      },
      required: ["processId"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for information. Returns relevant results.",
    permissionLevel: "read_only",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "host_exec",
    description: "Execute a command on the host machine. BLOCKED for security.",
    permissionLevel: "always_blocked",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to execute on host",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "host_file_read",
    description: "Read files from the host machine. BLOCKED for security.",
    permissionLevel: "always_blocked",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path on host",
        },
      },
      required: ["path"],
    },
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function getToolsByPermission(level: PermissionLevel): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => t.permissionLevel === level);
}