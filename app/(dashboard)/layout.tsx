import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, type XitSession } from "@/lib/auth/auth-options";
import { DashboardShell } from "@/components/dashboard-shell";
import { store } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await getServerSession(authOptions)) as XitSession | null;
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fchat");

  const projects = store.listProjects(session.user.id);
  const activeProject = projects[0];

  return (
    <DashboardShell
      user={{
        id: session.user.id,
        name: session.user.name || session.user.email,
        email: session.user.email,
        role: session.user.role,
        image: session.user.image ?? null,
      }}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      activeProjectId={activeProject?.id ?? null}
      aiReady={Boolean(process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL)}
    >
      {children}
    </DashboardShell>
  );
}
