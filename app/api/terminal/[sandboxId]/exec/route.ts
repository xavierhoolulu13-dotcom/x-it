import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { sandboxId: string } }
) {
  try {
    const { sandboxId } = params;
    const body = await req.json();
    const { command, timeout } = body;

    if (!command) {
      return NextResponse.json(
        { error: "command is required" },
        { status: 400 }
      );
    }

    // Security: Block dangerous commands
    const blocked = [
      /\brm\s+-rf\s+\/\b/,           // rm -rf /
      /\bmkfs\b/,                     // format filesystem
      /\bdd\b.*\/dev/,               // dd to devices
      /\b:(){ :\|:& };:/,           // fork bomb
      /\bcurl\b.*\|\s*bash/,        // curl pipe to shell
      /\bwget\b.*\|\s*bash/,        // wget pipe to shell
      /\bsudo\s+rm\b/,              // sudo rm
    ];

    for (const pattern of blocked) {
      if (pattern.test(command)) {
        return NextResponse.json(
          {
            stdout: "",
            stderr: "BLOCKED: This command is not allowed for security reasons.",
            exitCode: 1,
          },
          { status: 403 }
        );
      }
    }

    // In production, this would execute in the sandbox container
    // For now, return a simulated response
    const simulatedOutput = simulateCommand(command);

    return NextResponse.json({
      stdout: simulatedOutput.stdout,
      stderr: simulatedOutput.stderr,
      exitCode: simulatedOutput.exitCode,
      sandboxId,
    });
  } catch (error) {
    console.error("Terminal exec error:", error);
    return NextResponse.json(
      { error: "Failed to execute command" },
      { status: 500 }
    );
  }
}

function simulateCommand(command: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const cmd = command.trim();

  if (cmd === "pwd") return { stdout: "/home/sandbox/project", stderr: "", exitCode: 0 };
  if (cmd === "whoami") return { stdout: "sandbox", stderr: "", exitCode: 0 };
  if (cmd.startsWith("echo ")) return { stdout: cmd.slice(5).replace(/^["']|["']$/g, ""), stderr: "", exitCode: 0 };
  if (cmd === "ls" || cmd.startsWith("ls ")) return { stdout: "README.md\nsrc/\npackage.json", stderr: "", exitCode: 0 };
  if (cmd === "date") return { stdout: new Date().toString(), stderr: "", exitCode: 0 };
  if (cmd === "node --version") return { stdout: "v20.11.0", stderr: "", exitCode: 0 };
  if (cmd === "python3 --version") return { stdout: "Python 3.11.0", stderr: "", exitCode: 0 };
  if (cmd === "uname -a") return { stdout: "Linux sandbox 5.15.0 #1 SMP x86_64 GNU/Linux", stderr: "", exitCode: 0 };
  if (cmd.startsWith("cat ")) return { stdout: `[Contents of ${cmd.slice(4)}]\n// File contents would appear here`, stderr: "", exitCode: 0 };

  return {
    stdout: "",
    stderr: `Command simulated: '${cmd}' would run in the sandbox container.`,
    exitCode: 0,
  };
}