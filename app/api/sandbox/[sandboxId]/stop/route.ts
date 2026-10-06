import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    await manager.stop(runtime);
    return ok({ stopped: true, sandboxId: runtime.id });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    await manager.destroy(runtime);
    return ok({ destroyed: true, sandboxId: params.sandboxId });
  });
}
