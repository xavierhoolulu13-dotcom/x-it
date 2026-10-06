import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, type XitSession } from "@/lib/auth/auth-options";
import { store, type UserRecord } from "@/lib/db/store";

export interface AuthContext {
  userId: string;
  user: UserRecord;
  via: "session" | "api-token";
}

/**
 * Resolve the caller identity.
 *
 * - Normal browser requests use the NextAuth session cookie.
 * - Automation/CI requests may use `Authorization: Bearer $X_IT_API_TOKEN`,
 *   which maps to the demo/admin user. Disabled unless the env var is set.
 */
export async function getAuthContext(req?: NextRequest): Promise<AuthContext | null> {
  const token = process.env.X_IT_API_TOKEN;
  const header = req?.headers.get("authorization");
  if (token && header && header.toLowerCase().startsWith("bearer ")) {
    const provided = header.slice(7).trim();
    if (timingSafeEqual(provided, token)) {
      const configuredId = process.env.X_IT_API_TOKEN_USER_ID;
      const resolved =
        (configuredId ? store.getUserById(configuredId) : undefined) ||
        store.getUserByEmail(process.env.DEMO_EMAIL || "demo@xit.dev") ||
        store.snapshot().users.find((u) => u.role === "ADMIN");
      if (resolved) {
        return { userId: resolved.id, user: resolved, via: "api-token" };
      }
    }
  }

  const session = (await getServerSession(authOptions)) as XitSession | null;
  if (session?.user?.id) {
    const user = store.getUserById(session.user.id);
    if (user) return { userId: user.id, user, via: "session" };
  }
  return null;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAuth(req?: NextRequest): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
