import { NextRequest } from "next/server";
import { AGENT_TOOL_NAMES, TOOL_DEFINITIONS } from "@/lib/tools/tool-definitions";
import { getSandboxManager } from "@/lib/sandbox/manager";
import { getBrowserEngine } from "@/lib/browser/engine";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const manager = getSandboxManager();
    const backend = await manager.backendKind().catch(() => "unknown");
    const browser = await getBrowserEngine().isReady().catch(() => ({ ready: false, source: null, error: "unknown" }));

    return ok({
      tools: TOOL_DEFINITIONS,
      agentTools: AGENT_TOOL_NAMES,
      runtime: {
        sandboxBackend: backend,
        dockerAvailable: backend === "docker",
        browserReady: browser.ready,
        chromiumSource: browser.source,
        browserError: browser.error,
      },
    });
  });
}
