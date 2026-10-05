import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Reverse proxy to a server running inside the sandbox, so generated apps can be
 * previewed in an iframe without exposing host ports to the browser.
 * The iframe uses a same-origin relative URL, which keeps the preview working
 * behind any host or proxy.
 */
async function proxy(req: NextRequest, params: { sandboxId: string; path?: string[] }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const servers = manager.listServers(runtime).filter((s) => s.status === "running");
    if (servers.length === 0) {
      return fail("No server is running in this sandbox. Start one with server_start.", 409, {
        previewReady: false,
      });
    }

    const server = servers[servers.length - 1];
    const url = new URL(req.url);
    const targetPath = (params.path || []).join("/");
    const target = `http://127.0.0.1:${server.port}/${targetPath}${url.search}`;

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("cookie");
    headers.delete("authorization");
    headers.delete("content-length");
    headers.set("accept-encoding", "identity");

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });

      const responseHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (["content-encoding", "transfer-encoding", "connection", "content-length"].includes(key.toLowerCase())) return;
        responseHeaders.set(key, value);
      });
      responseHeaders.delete("x-frame-options");
      responseHeaders.set("Cache-Control", "no-store");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      return fail(
        `Preview server on port ${server.port} is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        502
      );
    }
  });
}

export async function GET(req: NextRequest, ctx: { params: { sandboxId: string; path?: string[] } }) {
  return proxy(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: { sandboxId: string; path?: string[] } }) {
  return proxy(req, ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: { sandboxId: string; path?: string[] } }) {
  return proxy(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: { sandboxId: string; path?: string[] } }) {
  return proxy(req, ctx.params);
}

export async function HEAD(req: NextRequest, ctx: { params: { sandboxId: string; path?: string[] } }) {
  return proxy(req, ctx.params);
}
