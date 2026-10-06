import { NextRequest } from "next/server";
import { z } from "zod";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { store } from "@/lib/db/store";
import { PolicyViolationError } from "@/lib/tools/errors";
import { ok, fail, readJson, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  command: z.string().min(1).max(10_000),
  timeout: z.number().min(1).max(300).optional(),
  cwd: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { sandboxId: string } }) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const runtime = await manager.get(params.sandboxId);
    if (!runtime) return fail("Sandbox not found", 404);
    if (runtime.record.userId !== ctx.userId && ctx.user.role !== "ADMIN") return fail("Forbidden", 403);

    const parsed = schema.safeParse(await readJson<unknown>(req));
    if (!parsed.success) return fail("command is required", 400);

    try {
      const result = await manager.exec(runtime, parsed.data.command, {
        timeoutSeconds: parsed.data.timeout ?? 30,
        workingDir: parsed.data.cwd,
      });

      if (result.blocked) {
        store.addAuditLog({
          userId: ctx.userId,
          action: "terminal.blocked",
          resource: "sandbox",
          resourceId: runtime.id,
          details: { command: parsed.data.command.slice(0, 300), rule: result.blocked.rule },
        });
        return fail(result.stderr || "Command blocked by policy", 403, {
          rule: result.blocked.rule,
          policy: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        });
      }

      store.addAuditLog({
        userId: ctx.userId,
        action: "terminal.exec",
        resource: "sandbox",
        resourceId: runtime.id,
        details: {
          command: parsed.data.command.slice(0, 500),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        },
      });

      return ok({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        durationMs: result.durationMs,
        sandboxId: runtime.id,
        cwd: runtime.workspaceDir,
      });
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        return fail(error.message, 403, { rule: error.rule, policy: true });
      }
      return fail(error instanceof Error ? error.message : "Command failed", 400);
    }
  });
}
