import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { store } from "@/lib/db/store";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const url = new URL(req.url);
    const body = (await readJson<{ path?: string }>(req)) || {};
    const path = body.path || url.searchParams.get("path");
    if (!path) return fail("path is required", 400);

    try {
      await manager.deletePath(runtime, path);
      store.addAuditLog({
        userId: ctx.userId,
        action: "file.delete",
        resource: "sandbox",
        resourceId: runtime.id,
        details: { path },
      });
      return ok({ deleted: true, path });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to delete path", 400);
    }
  });
}
