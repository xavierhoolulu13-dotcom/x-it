import { NextRequest } from "next/server";
import { z } from "zod";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { store } from "@/lib/db/store";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  path: z.string().min(1),
  content: z.string().max(5_000_000),
});

export async function POST(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const parsed = schema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("path and content are required", 400);

    try {
      await manager.writeFile(runtime, parsed.data.path, parsed.data.content);
      store.addAuditLog({
        userId: ctx.userId,
        action: "file.write",
        resource: "sandbox",
        resourceId: runtime.id,
        details: { path: parsed.data.path, bytes: parsed.data.content.length },
      });
      return ok({ written: true, path: parsed.data.path, bytes: parsed.data.content.length });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to write file", 400);
    }
  });
}
