import { NextRequest } from "next/server";
import { store } from "@/lib/db/store";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);
    const action = url.searchParams.get("action") || undefined;

    const logs = store.listAuditLogs({ userId: ctx.userId, limit, action }) as unknown as {
      id: string;
      action: string;
      resource: string;
      resourceId?: string;
      details: Record<string, unknown>;
      createdAt: string;
    }[];

    return ok({ logs, total: logs.length });
  });
}
