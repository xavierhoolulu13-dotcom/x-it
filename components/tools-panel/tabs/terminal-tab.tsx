"use client";

import { useEffect, useRef, useState } from "react";
import { useSandboxStore } from "@/lib/stores/sandbox-store";
import { useSandbox } from "@/lib/hooks/use-sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Play, Trash2 } from "lucide-react";

export function TerminalTab() {
  const { terminalOutput, addTerminalOutput, clearTerminalOutput } = useSandboxStore();
  const { sandbox, backend, loading, error } = useSandbox();
  const [command, setCommand] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [terminalOutput]);

  const handleRun = async () => {
    if (!command.trim() || isRunning) return;
    if (!sandbox) {
      addTerminalOutput("[error] No sandbox available");
      return;
    }

    const cmd = command.trim();
    setCommand("");
    addTerminalOutput(`$ ${cmd}`);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/terminal/${sandbox.id}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeout: 60 }),
      });
      const data = await res.json();

      if (!res.ok) {
        addTerminalOutput(`[blocked] ${data.error || "Command rejected"}`);
        return;
      }
      if (data.stdout) addTerminalOutput(data.stdout);
      if (data.stderr) addTerminalOutput(`[stderr] ${data.stderr}`);
      if (data.exitCode !== 0) addTerminalOutput(`[exit code: ${data.exitCode}]`);
      if (data.timedOut) addTerminalOutput("[killed: timeout]");
    } catch (err) {
      addTerminalOutput(`[error] ${err instanceof Error ? err.message : "Command failed"}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Terminal</span>
          <span className={`h-2 w-2 rounded-full ${sandbox ? "bg-status-idle" : "bg-muted-foreground"}`} />
          {backend && <span className="text-[10px] text-muted-foreground">{backend} backend</span>}
        </div>
        <Button variant="ghost" size="icon" onClick={clearTerminalOutput} className="h-6 w-6">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div ref={outputRef} className="flex-1 overflow-y-auto bg-black/95 p-3 font-mono text-xs text-green-400">
        {terminalOutput.length === 0 ? (
          <div className="text-muted-foreground">
            {loading
              ? "Preparing sandbox…"
              : error
                ? `Sandbox error: ${error}`
                : sandbox
                  ? `Ready in ${sandbox.workspaceDir} (${backend}). Type a command below.`
                  : "No sandbox active."}
          </div>
        ) : (
          terminalOutput.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        {isRunning && <div className="animate-pulse text-yellow-400">Running…</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        <span className="font-mono text-xs text-muted-foreground">$</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRun();
          }}
          placeholder="Enter command..."
          disabled={isRunning || !sandbox}
          className="h-7 flex-1 border-0 bg-transparent font-mono text-xs focus-visible:ring-0"
        />
        <Button variant="ghost" size="icon" onClick={handleRun} disabled={!command.trim() || isRunning} className="h-7 w-7">
          <Play className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default TerminalTab;
