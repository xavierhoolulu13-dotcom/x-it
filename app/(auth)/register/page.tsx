import { AuthForm } from "@/components/auth/auth-form";
import { enabledOAuthProviderIds } from "@/lib/auth/auth-options";

export const metadata = { title: "Create account — X-IT" };

export default function RegisterPage() {
  return <AuthForm mode="register" oauthProviders={enabledOAuthProviderIds()} />;
}
