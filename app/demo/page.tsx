import { redirect } from "next/navigation";
import { DemoAutoLogin } from "@/components/auth/demo-auto-login";
import { demoAutoLoginEnabled, demoCredentials } from "@/lib/auth/demo-login";

export const dynamic = "force-dynamic";

export const metadata = { title: "Opening X-IT…" };

/**
 * One-click entry point for hosted demos and previews.
 *
 * Enabled by X_IT_DEMO_AUTOLOGIN=true. When the flag is off this route simply
 * sends visitors to the normal sign-in page.
 */
export default function DemoPage() {
  if (!demoAutoLoginEnabled()) redirect("/login");

  const { email, password } = demoCredentials();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <DemoAutoLogin email={email} password={password} />
      </div>
    </main>
  );
}
