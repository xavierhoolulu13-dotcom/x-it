import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight gatekeeper.
 *
 * Middleware only performs a cheap cookie check so unauthenticated visitors get
 * redirected to /login without paying for a session decode on every request.
 * The authoritative check happens server-side:
 *   - pages:  app/(dashboard)/layout.tsx  → getServerSession()
 *   - APIs:   lib/auth/session.ts         → requireAuth()
 */

const PROTECTED_PREFIXES = ["/chat", "/settings", "/projects"];
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/health",
  "/api/version",
];

const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)?.value));
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isProtectedPage = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtectedPage && !hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isApi && !isPublicApi && !hasSessionCookie(req) && !req.headers.get("authorization")) {
    return NextResponse.json(
      { error: "Unauthorized", hint: "Sign in, or send Authorization: Bearer $X_IT_API_TOKEN" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/settings/:path*", "/projects/:path*", "/api/:path*"],
};
