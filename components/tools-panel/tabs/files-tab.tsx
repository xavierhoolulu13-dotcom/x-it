"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSandbox } from "@/lib/hooks/use-sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { File, Folder, RefreshCw, Save, X } from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
}

export function FilesTab() {
  const { sandbox, sandboxId, backend, loading: sandboxLoading, error: sandboxError } = useSandbox();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [path, setPath] = useState(".");
  const [loading, setLoading] = useState(false);
  const [openFile, setOpenFile] = useState<{ path: string; content: string; original: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (target = path) => {
      if (!sandboxId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/files/${sandboxId}/list?path=${encodeURIComponent(target)}&maxDepth=2`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to list files");
        setFiles(data.files || []);
        setPath(target);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to list files");
      } finally {
        setLoading(false);
      }
    },
    [path, sandboxId]
  );

  useEffect(() => {
    if (sandboxId) void load(".");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId]);

  const openFilePath = async (filePath: string) => {
    if (!sandboxId) return;
    try {
      const res = await fetch(`/api/files/${sandboxId}/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read file");
      setOpenFile({ path: filePath, content: data.content, original: data.content });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read file");
    }
  };

  const saveFile = async () => {
    if (!sandboxId || !openFile) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/files/${sandboxId}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: openFile.path, content: openFile.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOpenFile({ ...openFile, original: openFile.content });
      toast.success(`Saved ${openFile.path}`);
      void load(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (openFile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex-1 truncate text-xs font-medium">{openFile.path}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={saving || openFile.content === openFile.original}
            onClick={() => void saveFile()}
          >
            <Save className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpenFile(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <textarea
          value={openFile.content}
          onChange={(e) => setOpenFile({ ...openFile, content: e.target.value })}
          spellCheck={false}
          className="flex-1 resize-none bg-black/95 p-3 font-mono text-xs text-green-300 outline-none"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(path);
          }}
          className="h-7 flex-1 font-mono text-xs"
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void load(path)}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sandboxLoading ? (
          <p className="p-3 text-xs text-muted-foreground">Preparing sandbox…</p>
        ) : sandboxError ? (
          <p className="p-3 text-xs text-destructive">{sandboxError}</p>
        ) : files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-4xl">📁</span>
            <p className="mt-3 text-sm font-medium">Empty workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask the assistant to create a file, or write one from the terminal.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => (file.type === "file" ? void openFilePath(file.path) : void load(file.path))}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {file.type === "directory" ? (
                  <Folder className="h-3.5 w-3.5 text-status-thinking" />
                ) : (
                  <File className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {file.type === "file" ? `${Math.max(1, Math.round(file.size / 1024))}kb` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sandbox && (
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          {backend} · {sandbox.workspaceDir}
        </div>
      )}
    </div>
  );
}

export default FilesTab;
