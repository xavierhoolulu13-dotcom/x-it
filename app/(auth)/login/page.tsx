import { AuthForm } from "@/components/auth/auth-form";
import { enabledOAuthProviderIds } from "@/lib/auth/auth-options";

export const metadata = { title: "Sign in — X-IT" };

export default function LoginPage() {
  return <AuthForm mode="login" oauthProviders={enabledOAuthProviderIds()} />;
}
