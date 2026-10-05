"use client";

import { useUIStore } from "@/lib/stores/ui-store";
import { ToolsTab } from "./tabs/tools-tab";
import { FilesTab } from "./tabs/files-tab";
import { TerminalTab } from "./tabs/terminal-tab";
import { ApprovalsTab } from "./tabs/approvals-tab";
import { AuditTab } from "./tabs/audit-tab";
import { BrowserTab } from "./tabs/browser-tab";

const TABS = [
  { id: "tools" as const, label: "Tools", icon: "🔧" },
  { id: "files" as const, label: "Files", icon: "📁" },
  { id: "terminal" as const, label: "Terminal", icon: "💻" },
  { id: "browser" as const, label: "Browser", icon: "🌐" },
  { id: "approvals" as const, label: "Approvals", icon: "🛡️" },
  { id: "audit" as const, label: "Audit", icon: "📋" },
];

export function ToolsPanel() {
  const { toolsPanelTab, setToolsPanelTab } = useUIStore();

  const renderTab = () => {
    switch (toolsPanelTab) {
      case "tools":
        return <ToolsTab />;
      case "files":
        return <FilesTab />;
      case "terminal":
        return <TerminalTab />;
      case "browser":
        return <BrowserTab />;
      case "approvals":
        return <ApprovalsTab />;
      case "audit":
        return <AuditTab />;
      default:
        return <ToolsTab />;
    }
  };

  return (
    <div className="flex h-full w-96 flex-col border-l border-border bg-background">
      {/* Tab Bar */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setToolsPanelTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
              toolsPanelTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden xl:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">{renderTab()}</div>
    </div>
  );
}