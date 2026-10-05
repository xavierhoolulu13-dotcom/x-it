import { NextRequest } from "next/server";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const body = (await readJson<{ from?: string; to?: string }>(req)) || {};
    if (!body.from || !body.to) return fail("from and to are required", 400);

    try {
      await manager.renamePath(runtime, body.from, body.to);
      return ok({ renamed: true, from: body.from, to: body.to });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to rename", 400);
    }
  });
}
