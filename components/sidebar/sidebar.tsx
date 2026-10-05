"use client";

import { useState } from "react";
import { useChatStore } from "@/lib/stores/chat-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageSquarePlus,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Edit3,
  FolderOpen,
  X,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { conversations, activeConversationId, setActiveConversation, addConversation, deleteConversation, searchQuery, setSearchQuery } = useChatStore();
  const { activeProjectId, setActiveProjectId } = useUIStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewChat = () => {
    const newConv = {
      id: `conv-${Date.now()}`,
      title: "New conversation",
      projectId: activeProjectId || "default",
      messages: [],
      temperature: 0.7,
      maxTokens: 4096,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addConversation(newConv);
  };

  const handleStartEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      useChatStore.getState().updateConversation(id, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

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
      {/* Header */}
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

      {/* New Chat Button */}
      <div className="p-3">
        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? "No matching conversations" : "No conversations yet"}
            </div>
          ) : (
            filteredConversations.map((conv) => (
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
                  <button
                    onClick={() => setActiveConversation(conv.id)}
                    className="flex-1 truncate text-left"
                  >
                    {conv.title}
                  </button>
                )}
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleStartEdit(conv.id, conv.title)}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => deleteConversation(conv.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" className="w-full justify-start gap-2 text-sm">
          <FolderOpen className="h-4 w-4" />
          Projects
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 text-sm">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  );
}