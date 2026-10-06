import { NextRequest, NextResponse } from "next/server";
import { UnauthorizedError, requireAuth, type AuthContext } from "@/lib/auth/session";
import { PolicyViolationError } from "@/lib/tools/errors";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

export async function withAuth(
  req: NextRequest,
  handler: (ctx: AuthContext) => Promise<NextResponse | Response>
): Promise<NextResponse | Response> {
  try {
    const ctx = await requireAuth(req);
    return await handler(ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Unauthorized", 401);
    }
    if (error instanceof PolicyViolationError) {
      return fail(error.message, 403, { rule: error.rule, policy: true });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[api]", message);
    return fail(message, 500);
  }
}

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
