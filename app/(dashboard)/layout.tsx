"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { TopBar } from "@/components/top-bar";
import { ToolsPanel } from "@/components/tools-panel/tools-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true);

  return (
    <>
      {/* Left Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleToolsPanel={() => setToolsPanelOpen(!toolsPanelOpen)}
          toolsPanelOpen={toolsPanelOpen}
        />

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-hidden">{children}</main>

          {/* Right Tools Panel */}
          {toolsPanelOpen && (
            <ToolsPanel />
          )}
        </div>
      </div>
    </>
  );
}