import { redirect } from "next/navigation";
import { demoAutoLoginEnabled } from "@/lib/auth/demo-login";

// Read the demo flag at request time so a single build can be deployed with or
// without one-click demo access.
export const dynamic = "force-dynamic";

export default function Home() {
  // With X_IT_DEMO_AUTOLOGIN enabled, landing on the root signs straight into
  // the demo account instead of bouncing through the login form.
  redirect(demoAutoLoginEnabled() ? "/demo" : "/chat");
}
