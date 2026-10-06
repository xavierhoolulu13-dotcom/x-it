"use client";

import { useCallback, useEffect, useState } from "react";
import { useSandboxStore } from "@/lib/stores/sandbox-store";

export interface SandboxInfo {
  id: string;
  projectId: string;
  backend: "docker" | "local";
  status: string;
  workspaceDir: string;
  port: number | null;
  servers?: { id: string; port: number; command: string; status: string }[];
}

export function useSandbox(options: { autoCreate?: boolean } = {}) {
  const { autoCreate = true } = options;
  const { activeSandboxId, setActiveSandbox } = useSandboxStore();
  const [sandbox, setSandbox] = useState<SandboxInfo | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/sandbox");
      if (!res.ok) throw new Error(`Failed to load sandboxes (${res.status})`);
      const data = await res.json();
      setBackend(data.backend || "");
      const list: SandboxInfo[] = data.sandboxes || [];
      if (list.length > 0) {
        setSandbox(list[0]);
        if (list[0].id !== activeSandboxId) setActiveSandbox(list[0].id);
        return list[0];
      }
      if (autoCreate) {
        const created = await fetch("/api/sandbox/create", { method: "POST" });
        const payload = await created.json();
        if (!created.ok) throw new Error(payload.error || "Failed to create sandbox");
        const info: SandboxInfo = {
          id: payload.sandbox.id,
          projectId: payload.sandbox.projectId,
          backend: payload.sandbox.backend,
          status: payload.sandbox.status,
          workspaceDir: payload.sandbox.workspaceDir,
          port: payload.sandbox.port,
        };
        setSandbox(info);
        setActiveSandbox(info.id);
        return info;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox unavailable");
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sandbox, sandboxId: sandbox?.id || activeSandboxId, backend, loading, error, refresh };
}

export default useSandbox;
