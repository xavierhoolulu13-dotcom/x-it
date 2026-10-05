"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChatStore, type ConversationMeta } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquarePlus,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  FolderOpen,
  X,
  RefreshCw,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  projects?: { id: string; name: string }[];
  activeProjectId?: string | null;
}

export function Sidebar({ isOpen, onToggle, projects = [], activeProjectId }: SidebarProps) {
  const router = useRouter();
  const {
    conversations,
    activeConversationId,
    setConversations,
    upsertConversation,
    removeConversation,
    setActiveConversation,
    searchQuery,
    setSearchQuery,
    reset,
  } = useChatStore();
  const { setActiveProjectId } = useUIStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const projectId = activeProjectId || projects[0]?.id || null;

  const loadConversations = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [projectId, setConversations]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const handleNewChat = async () => {
    if (!projectId) {
      toast.error("Create a project first");
      return;
    }
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: "New conversation" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create conversation");
      const meta: ConversationMeta = {
        id: data.conversation.id,
        title: data.conversation.title,
        projectId: data.conversation.projectId,
        modelId: data.conversation.modelId,
        updatedAt: data.conversation.updatedAt,
        messageCount: 0,
      };
      upsertConversation(meta);
      setActiveConversation(meta.id);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create conversation");
    }
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
  };

  const handleSaveEdit = async (id: string) => {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Rename failed");
      upsertConversation({ ...(conversations.find((c) => c.id === id) as ConversationMeta), title });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      removeConversation(id);
      if (activeConversationId === id) reset();
      toast.success("Conversation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r border-sidebar-border bg-sidebar py-4">
        <Button variant="ghost" size="icon" onClick={onToggle} className="mb-4">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleNewChat}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">X</span>
          </div>
          <span className="text-sm font-semibold">X-IT</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button onClick={handleNewChat} className="w-full justify-start gap-2" variant="outline">
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-9 text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {loading && conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? "No matching conversations" : "No conversations yet"}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                {editingId === conv.id ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleSaveEdit(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(conv.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="h-6 flex-1 text-sm"
                  />
                ) : (
                  <button onClick={() => handleSelect(conv.id)} className="flex-1 truncate text-left">
                    {conv.title}
                  </button>
                )}
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setEditingId(conv.id);
                      setEditTitle(conv.title);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => handleDelete(conv.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 space-y-1">
          {projects.slice(0, 4).map((project) => (
            <button
              key={project.id}
              onClick={() => {
                setActiveProjectId(project.id);
                router.refresh();
              }}
              className={`flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-xs ${
                project.id === projectId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
              }`}
            >
              <FolderOpen className="h-3 w-3" />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => void loadConversations()}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={() => router.push("/settings")}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  );
}

export default Sidebar;
