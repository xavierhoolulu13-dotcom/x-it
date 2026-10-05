import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const manager = getSandboxManager();
    const records = store.listSandboxRecords(ctx.userId);
    const sandboxes = await Promise.all(
      records.map(async (record) => {
        const runtime = await manager.get(record.id);
        return {
          ...record,
          servers: runtime ? manager.listServers(runtime) : [],
        };
      })
    );
    const backend = await manager.backendKind().catch(() => "unknown");
    return ok({ sandboxes, backend });
  });
}
