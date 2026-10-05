"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card text-card-foreground shadow-sm ${className}`}>{children}</div>;
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col space-y-1.5 p-6 pb-2">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold leading-none tracking-tight">{children}</h2>;
}

function CardDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-6 pt-2 ${className}`}>{children}</div>;
}

function Badge({ children, variant = "outline" }: { children: React.ReactNode; variant?: "outline" | "secondary" | "default" }) {
  const styles = {
    outline: "border border-border text-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    default: "bg-primary text-primary-foreground",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

interface HealthResponse {
  status: string;
  version?: string;
  uptimeSeconds?: number;
  checks?: Record<string, { status: string; detail?: string }>;
}

interface VersionResponse {
  version: string;
  name?: string;
  build?: string;
  node?: string;
  features?: string[];
}

interface ModelsResponse {
  models: { id: string; name?: string; demo?: boolean; provider?: string }[];
  active?: string;
  provider: string;
  demoMode: boolean;
}

interface SandboxResponse {
  sandbox?: {
    id: string;
    backend?: string;
    status?: string;
    workspacePath?: string;
    createdAt?: string;
  } | null;
  backend?: string;
}

interface BrowserStatusResponse {
  ready: boolean;
  source?: string;
  sessions?: number;
  error?: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  resource?: string;
  createdAt: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      aria-hidden
    />
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [sandbox, setSandbox] = useState<SandboxResponse | null>(null);
  const [browser, setBrowser] = useState<BrowserStatusResponse | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, versionRes, modelsRes, sandboxRes, browserRes, auditRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/version"),
        fetch("/api/models"),
        fetch("/api/sandbox"),
        fetch("/api/browser/status"),
        fetch("/api/audit?limit=10"),
      ]);

      if (healthRes.ok) setHealth((await healthRes.json()) as HealthResponse);
      if (versionRes.ok) setVersion((await versionRes.json()) as VersionResponse);
      if (modelsRes.ok) setModels((await modelsRes.json()) as ModelsResponse);
      if (sandboxRes.ok) setSandbox((await sandboxRes.json()) as SandboxResponse);
      if (browserRes.ok) setBrowser((await browserRes.json()) as BrowserStatusResponse);
      if (auditRes.ok) {
        const data = (await auditRes.json()) as { logs?: AuditEntry[]; entries?: AuditEntry[] };
        setAudit(data.logs ?? data.entries ?? []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load runtime information");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const healthy = health?.status === "ok" || health?.status === "healthy";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live runtime status for this X-IT deployment. Values come from the running server, not
            from a config file.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/40">
          <CardContent className="pt-6 text-sm text-red-500">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle><span className="flex items-center gap-2">
            <StatusDot ok={Boolean(healthy)} /> Application
          </span></CardTitle>
          <CardDescription>Health, version and session security.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-medium">{health?.status ?? "unknown"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Version</div>
            <div className="font-medium">{version?.version ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Node runtime</div>
            <div className="font-medium">{version?.node ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Authentication</div>
            <div className="font-medium">Credentials (bcrypt) · 30-day JWT sessions</div>
          </div>
          {version?.features && version.features.length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-muted-foreground">Enabled features</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {version.features.map((feature) => (
                  <Badge key={feature} variant="secondary">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="flex items-center gap-2">
            <StatusDot ok={Boolean(models && !models.demoMode)} /> AI provider
          </span></CardTitle>
          <CardDescription>
            {models?.demoMode
              ? "No API key detected — the offline demo agent is handling requests."
              : `Connected to ${models?.provider ?? "provider"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Provider</span>
            <Badge variant="outline">{models?.provider ?? "—"}</Badge>
            {models?.demoMode && <Badge variant="secondary">demo mode</Badge>}
          </div>
          <div>
            <div className="text-muted-foreground">Models</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(models?.models ?? []).map((model) => (
                <Badge key={model.id} variant={model.id === models?.active ? "default" : "outline"}>
                  {model.id}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-muted-foreground">
            Set <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> (OpenAI-compatible) or{" "}
            <code className="rounded bg-muted px-1">OLLAMA_BASE_URL</code> to switch providers. Demo
            mode requires no credentials and still executes real tools in the sandbox.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="flex items-center gap-2">
            <StatusDot ok={sandbox?.sandbox?.status === "running"} /> Sandbox
          </span></CardTitle>
          <CardDescription>Where tool execution actually happens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Backend</div>
            <div className="font-medium">{sandbox?.sandbox?.backend ?? sandbox?.backend ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-medium">{sandbox?.sandbox?.status ?? "not created"}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-muted-foreground">Workspace</div>
            <div className="break-all font-medium">{sandbox?.sandbox?.workspacePath ?? "—"}</div>
          </div>
          <p className="text-muted-foreground sm:col-span-2">
            Docker is used when <code className="rounded bg-muted px-1">DOCKER_HOST</code> is
            reachable; otherwise X-IT falls back to the hardened local backend (path jail, command
            policy, detached processes).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="flex items-center gap-2">
            <StatusDot ok={Boolean(browser?.ready)} /> Browser automation
          </span></CardTitle>
          <CardDescription>Headless Chromium driven by puppeteer-core.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Chromium</div>
            <div className="font-medium">{browser?.ready ? `ready (${browser.source})` : "unavailable"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Open sessions</div>
            <div className="font-medium">{browser?.sessions ?? 0}</div>
          </div>
          {browser?.error && <p className="text-red-500 sm:col-span-2">{browser.error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="flex items-center gap-2">Recent audit activity</span></CardTitle>
          <CardDescription>Every tool call and approval is recorded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {audit.length === 0 && <p className="text-muted-foreground">No activity recorded yet.</p>}
          {audit.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 border-b py-1 last:border-0">
              <span className="font-mono text-xs">{entry.action}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
