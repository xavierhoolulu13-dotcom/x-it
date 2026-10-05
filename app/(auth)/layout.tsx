import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/chat");

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-background p-6">
      <div className="grid w-full max-w-5xl gap-8 md:grid-cols-2 md:items-center">
        <div className="hidden flex-col gap-4 md:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
              X
            </div>
            <div>
              <h1 className="text-xl font-semibold">X-IT</h1>
              <p className="text-xs text-muted-foreground">Personal AI Computer Assistant</p>
            </div>
          </div>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>▸ Real sandbox: files, shell, code execution</li>
            <li>▸ Real headless browser automation with screenshots</li>
            <li>▸ Approval queue + full audit trail for every tool call</li>
            <li>▸ Works with OpenAI-compatible APIs or local Ollama</li>
          </ul>
        </div>
        <Suspense fallback={<div className="h-80 w-full animate-pulse rounded-xl bg-muted" />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
