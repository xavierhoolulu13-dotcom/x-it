import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const path = new URL(req.url).searchParams.get("path");
    if (!path) return fail("path is required", 400);

    try {
      const content = await manager.readFile(runtime, path);
      return ok({ content, path, sandboxId: runtime.id, bytes: content.length });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to read file", 400);
    }
  });
}
