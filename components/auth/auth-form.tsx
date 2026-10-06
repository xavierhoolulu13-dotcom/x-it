"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

interface AuthFormProps {
  mode: Mode;
  oauthProviders: string[];
}

export function AuthForm({ mode, oauthProviders }: AuthFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/chat";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode === "login" ? "demo@xit.dev" : "");
  const [password, setPassword] = useState(mode === "login" ? "demo1234" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        toast.success("Account created — signing you in");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        throw new Error(
          result?.error === "CredentialsSignin"
            ? "Invalid email or password"
            : result?.error || "Sign-in failed"
        );
      }

      toast.success(mode === "register" ? "Welcome to X-IT" : "Signed in");
      router.push(result.url || callbackUrl);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">
        {mode === "login" ? "Sign in to X-IT" : "Create your account"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {mode === "login"
          ? "Use the demo account or your own credentials."
          : "You get a starter project and sandbox immediately."}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        {mode === "register" && (
          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {oauthProviders.length > 0 && (
        <>
          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-2">
            {oauthProviders.map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                className="flex-1 capitalize"
                onClick={() => signIn(provider, { callbackUrl })}
              >
                {provider}
              </Button>
            ))}
          </div>
        </>
      )}

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>

      {mode === "login" && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-center text-[11px] text-muted-foreground">
          Demo login: <span className="font-mono">demo@xit.dev</span> /{" "}
          <span className="font-mono">demo1234</span>
        </p>
      )}
    </div>
  );
}
