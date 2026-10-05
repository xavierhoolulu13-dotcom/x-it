/**
 * In-memory data store for development/demo.
 * This provides a working database layer when Prisma is not available.
 * In production, replace with Prisma client calls.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  hashedPassword?: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  userId: string;
  systemPrompt: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  projectId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  messageId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: string | null;
  error: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  createdAt: Date;
}

export interface Approval {
  id: string;
  toolCallId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  userId: string;
  decidedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

class InMemoryStore {
  users: Map<string, User> = new Map();
  projects: Map<string, Project> = new Map();
  conversations: Map<string, Conversation> = new Map();
  messages: Map<string, Message> = new Map();
  toolCalls: Map<string, ToolCall> = new Map();
  approvals: Map<string, Approval> = new Map();
  auditLogs: AuditLog[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    // Create demo user
    const user: User = {
      id: "user-demo",
      email: "demo@xit.dev",
      name: "Demo User",
      role: "ADMIN",
      settings: { theme: "dark", defaultModel: "gpt-4" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);

    // Create default project
    const project: Project = {
      id: "project-default",
      name: "Default Project",
      description: "Your default workspace",
      userId: user.id,
      systemPrompt:
        "You are a helpful AI computer assistant. You can create files, run code, execute commands, and browse the web — all inside an isolated sandbox environment.",
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(project.id, project);
  }

  // User operations
  getUserById(id: string) { return this.users.get(id); }
  getUserByEmail(email: string) { return Array.from(this.users.values()).find(u => u.email === email); }
  createUser(user: User) { this.users.set(user.id, user); return user; }

  // Project operations
  getProjectsByUser(userId: string) { return Array.from(this.projects.values()).filter(p => p.userId === userId); }
  getProjectById(id: string) { return this.projects.get(id); }
  createProject(project: Project) { this.projects.set(project.id, project); return project; }
  updateProject(id: string, updates: Partial<Project>) {
    const existing = this.projects.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }
  deleteProject(id: string) { return this.projects.delete(id); }

  // Conversation operations
  getConversationsByProject(projectId: string) {
    return Array.from(this.conversations.values())
      .filter(c => c.projectId === projectId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  getConversationById(id: string) { return this.conversations.get(id); }
  createConversation(conv: Conversation) { this.conversations.set(conv.id, conv); return conv; }
  updateConversation(id: string, updates: Partial<Conversation>) {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.conversations.set(id, updated);
    return updated;
  }
  deleteConversation(id: string) {
    // Also delete messages
    for (const [msgId, msg] of Array.from(this.messages.entries())) {
      if (msg.conversationId === id) this.messages.delete(msgId);
    }
    return this.conversations.delete(id);
  }

  // Message operations
  getMessagesByConversation(conversationId: string) {
    return Array.from(this.messages.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  createMessage(message: Message) { this.messages.set(message.id, message); return message; }

  // Tool call operations
  getToolCallsByMessage(messageId: string) {
    return Array.from(this.toolCalls.values()).filter(tc => tc.messageId === messageId);
  }
  createToolCall(toolCall: ToolCall) { this.toolCalls.set(toolCall.id, toolCall); return toolCall; }
  updateToolCall(id: string, updates: Partial<ToolCall>) {
    const existing = this.toolCalls.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.toolCalls.set(id, updated);
    return updated;
  }

  // Approval operations
  getPendingApprovals(userId: string) {
    return Array.from(this.approvals.values()).filter(a => a.userId === userId && a.status === "PENDING");
  }
  getApprovalById(id: string) { return this.approvals.get(id); }
  createApproval(approval: Approval) { this.approvals.set(approval.id, approval); return approval; }
  updateApproval(id: string, updates: Partial<Approval>) {
    const existing = this.approvals.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.approvals.set(id, updated);
    return updated;
  }

  // Audit log operations
  addAuditLog(log: AuditLog) { this.auditLogs.unshift(log); return log; }
  getAuditLogs(userId: string, limit = 50) {
    return this.auditLogs.filter(l => l.userId === userId).slice(0, limit);
  }
}

// Singleton
const globalForStore = globalThis as unknown as { __xitStore: InMemoryStore | undefined };
export const store = globalForStore.__xitStore ?? new InMemoryStore();
if (process.env.NODE_ENV !== "production") globalForStore.__xitStore = store;