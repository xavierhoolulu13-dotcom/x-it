import { NextRequest } from "next/server";
import { z } from "zod";
import { executeTool } from "@/lib/tools/executor";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { store } from "@/lib/db/store";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
  sandboxId: z.string().optional(),
  browserSessionId: z.string().optional(),
  autoApprove: z.boolean().optional(),
  conversationId: z.string().optional(),
});

/**
 * Execute a single tool directly (used by the terminal panel, the browser tab,
 * and by automation/E2E scripts).
 */
export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const parsed = schema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("Invalid request", 400, { details: parsed.error.flatten() });

    const manager = getSandboxManager();
    let sandbox = parsed.data.sandboxId ? await manager.get(parsed.data.sandboxId) : null;
    if (!sandbox && parsed.data.sandboxId) return fail("Sandbox not found", 404);
    if (!sandbox) {
      const project = store.listProjects(ctx.userId)[0];
      if (project) {
        try {
          sandbox = await manager.ensure(ctx.userId, project.id);
        } catch (error) {
          console.warn("[tools] sandbox unavailable:", error instanceof Error ? error.message : error);
        }
      }
    }

    const result = await executeTool(parsed.data.tool, parsed.data.arguments || {}, {
      userId: ctx.userId,
      conversationId: parsed.data.conversationId,
      sandbox,
      browserSessionId: parsed.data.browserSessionId ?? null,
      autoApprove: parsed.data.autoApprove ?? false,
    });

    return ok({ result }, { status: result.ok ? 200 : 400 });
  });
}
