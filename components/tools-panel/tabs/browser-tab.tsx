"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Camera,
  MousePointerClick,
  Loader2,
  X,
  Monitor,
  Smartphone,
  Download,
} from "lucide-react";

interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  selector: string;
  href?: string;
}

interface PageState {
  sessionId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: InteractiveElement[];
  actionCount: number;
  lastAction?: { type: string; detail: string; ok: boolean; error?: string; at: string };
}

interface ActionRecord {
  id: string;
  type: string;
  detail: string;
  at: string;
  ok: boolean;
  error?: string;
}

export function BrowserTab() {
  const [url, setUrl] = useState("https://example.com");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<PageState | null>(null);
  const [logs, setLogs] = useState<ActionRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [screenshotTick, setScreenshotTick] = useState(0);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [clickMode, setClickMode] = useState(false);
  const screenshotRef = useRef<HTMLImageElement>(null);

  // Warm up the engine so the first navigation feels instant.
  useEffect(() => {
    fetch("/api/browser/status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ready) setUnavailable(data.error || "Chromium is unavailable");
      })
      .catch(() => undefined);
  }, []);

  const applyState = useCallback((next: PageState) => {
    setState(next);
    setUrl(next.url === "about:blank" ? "" : next.url);
    setScreenshotTick((tick) => tick + 1);
    if (next.lastAction) {
      setLogs((prev) =>
        [
          {
            id: `${Date.now()}-${prev.length}`,
            type: next.lastAction!.type,
            detail: next.lastAction!.detail,
            at: next.lastAction!.at,
            ok: next.lastAction!.ok,
            error: next.lastAction!.error,
          },
          ...prev,
        ].slice(0, 40)
      );
    }
  }, []);

  const startSession = useCallback(
    async (initialUrl?: string) => {
      setStarting(true);
      try {
        const res = await fetch("/api/browser/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: initialUrl || undefined, name: "Panel browser" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not start the browser");
        setSessionId(data.state.sessionId);
        applyState(data.state);
        setUnavailable(null);
        toast.success("Headless Chromium session started");
        return data.state.sessionId as string;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Browser unavailable";
        setUnavailable(message);
        toast.error(message);
        return null;
      } finally {
        setStarting(false);
      }
    },
    [applyState]
  );

  const requireSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    return startSession();
  }, [sessionId, startSession]);

  const navigate = useCallback(
    async (target?: string) => {
      const id = await requireSession();
      if (!id) return;
      const destination = (target ?? url).trim();
      if (!destination) return;

      setBusy("navigate");
      try {
        const res = await fetch(`/api/browser/sessions/${id}/navigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: destination }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Navigation failed");
        applyState(data.state);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Navigation failed");
      } finally {
        setBusy(null);
      }
    },
    [applyState, requireSession, url]
  );

  const action = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      const id = await requireSession();
      if (!id) return;
      setBusy(label);
      try {
        const res = await fetch(`/api/browser/sessions/${id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `${label} failed`);
        applyState(data.state);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `${label} failed`);
      } finally {
        setBusy(null);
      }
    },
    [applyState, requireSession]
  );

  const capture = useCallback(
    async (fullPage = false) => {
      const id = await requireSession();
      if (!id) return;
      setBusy("screenshot");
      try {
        await fetch(`/api/browser/sessions/${id}/screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullPage }),
        });
        setScreenshotTick((tick) => tick + 1);
        toast.success("Screenshot captured");
      } finally {
        setBusy(null);
      }
    },
    [requireSession]
  );

  const closeSession = async () => {
    if (!sessionId) return;
    await fetch(`/api/browser/sessions/${sessionId}`, { method: "DELETE" });
    setSessionId(null);
    setState(null);
    setLogs([]);
    toast.info("Browser session closed");
  };

  const onScreenshotClick = async (event: React.MouseEvent<HTMLImageElement>) => {
    if (!clickMode || !sessionId || !state) return;
    const img = screenshotRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const scaleX = state.viewport.width / rect.width;
    const scaleY = state.viewport.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    await action({ type: "click", x, y }, "click");
  };

  const screenshotUrl = sessionId ? `/api/browser/sessions/${sessionId}/screenshot?format=png&t=${screenshotTick}` : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => action({ type: "back" }, "back")}>
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => action({ type: "forward" }, "forward")}>
            <ArrowRight className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => action({ type: "reload" }, "reload")}>
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void navigate();
            }}
            placeholder="https://example.com"
            className="h-7 flex-1 text-xs"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void navigate()} disabled={busy === "navigate"}>
            {busy === "navigate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void capture(false)} disabled={busy === "screenshot"}>
            <Camera className="h-3 w-3" />
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <Button
            variant={clickMode ? "default" : "outline"}
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => setClickMode((value) => !value)}
            title="Click on the screenshot to click in the page"
          >
            <MousePointerClick className="h-3 w-3" /> {clickMode ? "Click mode on" : "Click mode"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => action({ type: "setViewport", viewport: { width: 1280, height: 800 } }, "viewport")}
          >
            <Monitor className="h-3 w-3" /> Desktop
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => action({ type: "setViewport", viewport: { width: 390, height: 844 } }, "viewport")}
          >
            <Smartphone className="h-3 w-3" /> Mobile
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => action({ type: "scroll", y: 700 }, "scroll")}
          >
            <Download className="h-3 w-3" /> Scroll
          </Button>
          {sessionId && (
            <Button variant="ghost" size="sm" className="ml-auto h-6 gap-1 px-2 text-[10px]" onClick={closeSession}>
              <X className="h-3 w-3" /> Close
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {unavailable ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <span className="text-3xl">🚫</span>
            <p className="mt-3 text-sm font-medium">Browser unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{unavailable}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Run <code className="rounded bg-muted px-1">node scripts/prepare-chromium.mjs</code> to install Chromium.
            </p>
          </div>
        ) : !sessionId ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <span className="text-4xl">🌐</span>
            <p className="mt-3 text-sm font-medium">No browser session</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a real headless Chromium session, then navigate anywhere or let the AI drive it.
            </p>
            <Button className="mt-4" onClick={() => void startSession(url)} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Start browser
            </Button>
          </div>
        ) : (
          <div className="space-y-3 p-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate font-medium text-foreground">{state?.title || "(untitled)"}</span>
              <span className="ml-auto whitespace-nowrap">
                {state?.viewport.width}×{state?.viewport.height} · {state?.actionCount ?? 0} actions
              </span>
            </div>

            {screenshotUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                ref={screenshotRef}
                src={screenshotUrl}
                alt="Live browser screenshot"
                onClick={onScreenshotClick}
                className={`w-full rounded-md border border-border ${clickMode ? "cursor-crosshair" : ""}`}
              />
            )}

            {state && state.elements.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  Interactive elements ({state.elements.length})
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {state.elements.slice(0, 40).map((element) => (
                    <button
                      key={`${element.index}-${element.selector}`}
                      onClick={() => action({ type: "click", selector: element.selector }, "click")}
                      className="flex w-full items-center gap-2 rounded border border-border px-2 py-1 text-left text-[11px] hover:bg-accent"
                    >
                      <span className="w-5 text-right text-muted-foreground">{element.index}</span>
                      <span className="rounded bg-muted px-1 text-[10px]">{element.tag}</span>
                      <span className="flex-1 truncate">{element.text || element.href || "(no label)"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">Action log</p>
                <div className="space-y-0.5 font-mono text-[10px]">
                  {logs.slice(0, 12).map((log) => (
                    <div key={log.id} className="flex gap-2">
                      <span className="text-muted-foreground">{new Date(log.at).toLocaleTimeString()}</span>
                      <span className={log.ok ? "text-status-completed" : "text-destructive"}>{log.type}</span>
                      <span className="flex-1 truncate text-muted-foreground">{log.error || log.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BrowserTab;
