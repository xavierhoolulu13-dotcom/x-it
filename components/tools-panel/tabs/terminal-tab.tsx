"use client";

import { useSandboxStore } from "@/lib/stores/sandbox-store";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Play, Trash2 } from "lucide-react";

export function TerminalTab() {
  const { terminalOutput, addTerminalOutput, clearTerminalOutput, activeSandboxId } =
    useSandboxStore();
  const [command, setCommand] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleRun = async () => {
    if (!command.trim() || isRunning) return;

    const cmd = command.trim();
    setCommand("");
    addTerminalOutput(`$ ${cmd}`);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/terminal/${activeSandboxId || "default"}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });

      const data = await res.json();

      if (data.stdout) addTerminalOutput(data.stdout);
      if (data.stderr) addTerminalOutput(`[stderr] ${data.stderr}`);
      if (data.exitCode !== 0) {
        addTerminalOutput(`[exit code: ${data.exitCode}]`);
      }
    } catch (error) {
      addTerminalOutput(
        `[error] ${error instanceof Error ? error.message : "Command failed"}`
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Terminal</span>
          <span
            className={`h-2 w-2 rounded-full ${
              activeSandboxId ? "bg-status-idle" : "bg-muted-foreground"
            }`}
          />
        </div>
        <Button variant="ghost" size="icon" onClick={clearTerminalOutput} className="h-6 w-6">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto bg-black/95 p-3 font-mono text-xs text-green-400"
      >
        {terminalOutput.length === 0 ? (
          <div className="text-muted-foreground">
            {activeSandboxId
              ? "Ready. Type a command below."
              : "No sandbox active. Create a sandbox to run commands."}
          </div>
        ) : (
          terminalOutput.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        {isRunning && (
          <div className="animate-pulse text-yellow-400">Running...</div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border p-2">
        <span className="font-mono text-xs text-muted-foreground">$</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRun();
          }}
          placeholder="Enter command..."
          disabled={isRunning}
          className="h-7 flex-1 border-0 bg-transparent font-mono text-xs focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRun}
          disabled={!command.trim() || isRunning}
          className="h-7 w-7"
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}