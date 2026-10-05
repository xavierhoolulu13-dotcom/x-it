"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TopBar } from "@/components/top-bar";
import { ToolsPanel } from "@/components/tools-panel/tools-panel";

export interface DashboardUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  image: string | null;
}

export function DashboardShell({
  children,
  user,
  projects,
  activeProjectId,
  aiReady,
}: {
  children: React.ReactNode;
  user: DashboardUser;
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  aiReady: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true);

  return (
    <>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        projects={projects}
        activeProjectId={activeProjectId}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleToolsPanel={() => setToolsPanelOpen(!toolsPanelOpen)}
          toolsPanelOpen={toolsPanelOpen}
          user={user}
          projects={projects}
          activeProjectId={activeProjectId}
          aiReady={aiReady}
        />

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-hidden">{children}</main>
          {toolsPanelOpen && <ToolsPanel />}
        </div>
      </div>
    </>
  );
}

export default DashboardShell;
