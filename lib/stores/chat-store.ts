import { create } from "zustand";

export interface UiToolCall {
  /** Tool call record id (used for approval lookups). */
  id: string;
  /** Provider-side call id (links streamed results back). */
  refId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: "pending" | "waiting_approval" | "running" | "completed" | "failed" | "rejected";
  permissionLevel?: string;
  reason?: string;
  output?: string;
  error?: string;
  screenshot?: string;
  screenshotFormat?: "png" | "jpeg";
  previewUrl?: string;
  sandboxId?: string;
  browserSessionId?: string;
  approvalId?: string;
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  toolCalls?: UiToolCall[];
  isStreaming?: boolean;
  demoMode?: boolean;
}

export interface ConversationMeta {
  id: string;
  title: string;
  projectId: string;
  modelId?: string;
  updatedAt: string;
  messageCount?: number;
}

interface ChatState {
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  searchQuery: string;
  activeModel: string;

  setConversations: (conversations: ConversationMeta[]) => void;
  upsertConversation: (conversation: ConversationMeta) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setIsStreaming: (value: boolean) => void;
  setSearchQuery: (value: string) => void;
  setActiveModel: (model: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  searchQuery: "",
  activeModel: "",

  setConversations: (conversations) => set({ conversations }),

  upsertConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      return {
        conversations: exists
          ? state.conversations.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
          : [conversation, ...state.conversations],
      };
    }),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveModel: (activeModel) => set({ activeModel }),
  reset: () => set({ messages: [], isStreaming: false }),
}));

export default useChatStore;
