"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";

interface Props {
  email: string;
  password: string;
}

/**
 * Signs the visitor into the built-in demo account and forwards them to the
 * dashboard. Rendered only when the operator enabled X_IT_DEMO_AUTOLOGIN and a
 * demo account exists — see lib/auth/demo-login.ts.
 */
export function DemoAutoLogin({ email, password }: Props) {
  const router = useRouter();
  const attempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        // Never clobber an existing session.
        const existing = await getSession();
        if (existing) {
          router.replace("/chat");
          return;
        }

        const result = await signIn("credentials", { email, password, redirect: false });
        if (!result || result.error) {
          setError(result?.error === "CredentialsSignin" ? "Demo sign-in was rejected" : result?.error || "Sign-in failed");
          return;
        }
        router.replace("/chat");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Sign-in failed");
      }
    })();
  }, [email, password, router]);

  if (error) {
    return (
      <div className="w-full rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Could not sign in automatically</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-primary underline">
          Sign in manually
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span className="text-lg font-bold">X</span>
      </div>
      <h1 className="mt-3 text-lg font-semibold">Opening X-IT…</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signing you in as <span className="font-medium">{email}</span>
      </p>
      <div
        className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Signing in"
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
      </div>
      <Link href="/login" className="mt-4 inline-block text-xs text-muted-foreground underline">
        Use a different account
      </Link>
    </div>
  );
}
