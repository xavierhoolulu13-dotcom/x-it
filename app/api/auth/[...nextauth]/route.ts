import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";

/**
 * NextAuth handler.
 *
 * `NEXTAUTH_URL` is derived from the incoming request when it is not pinned in
 * the environment, so the same build works behind any host (localhost, a
 * Docker host, or a proxied preview domain).
 */
async function handler(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const pinned = process.env.X_IT_PIN_NEXTAUTH_URL === "true";

  if (host && (!process.env.NEXTAUTH_URL || !pinned)) {
    process.env.NEXTAUTH_URL = `${proto}://${host}`;
  }

  return NextAuth(authOptions)(req as never, ctx as never);
}

export { handler as GET, handler as POST };
