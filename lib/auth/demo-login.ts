import { store } from "@/lib/db/store";
import { normalizeEmail } from "@/lib/auth/passwords";

/**
 * One-click demo access.
 *
 * X-IT ships a built-in demo account. When X_IT_DEMO_AUTOLOGIN is enabled, the
 * landing page can sign a visitor straight into that account so the deployment
 * is usable without a login step (handy for hosted demos, previews and
 * screenshots).
 *
 * Safety rules:
 *   - Off unless X_IT_DEMO_AUTOLOGIN is explicitly "true"/"1".
 *   - Only ever signs in the configured demo account — never another user.
 *   - Never touches an existing session: a signed-in visitor is left alone.
 *   - Disabled entirely if the demo account is missing or OAuth-only.
 */
export const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@xit.dev";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo1234";

export function demoAutoLoginRequested(): boolean {
  const value = (process.env.X_IT_DEMO_AUTOLOGIN || "").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Whether the demo shortcut may be used right now: requested by the operator
 * *and* backed by a real demo account with a password.
 */
export function demoAutoLoginEnabled(): boolean {
  if (!demoAutoLoginRequested()) return false;
  const user = store.getUserByEmail(normalizeEmail(DEMO_EMAIL));
  return Boolean(user?.hashedPassword);
}

export function demoCredentials(): { email: string; password: string } {
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}
