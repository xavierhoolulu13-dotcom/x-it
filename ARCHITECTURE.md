# Personal AI Computer Assistant — Architecture

## Overview

A full-stack web application combining AI chat, sandbox computer control, tool execution, and app building into one polished personal AI workspace.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend API | Next.js API Routes + Server Actions |
| Database | PostgreSQL via Prisma ORM |
| Real-time | Server-Sent Events (SSE) for streaming, WebSockets for terminal |
| Sandbox | Docker containers (one per project) |
| Auth | NextAuth.js with credentials + OAuth providers |
| AI Providers | OpenAI-compatible API adapter layer |

## Monorepo Structure

```
x-it/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Auth pages (login, register)
│   ├── (dashboard)/        # Main app layout
│   │   ├── chat/           # Chat interface
│   │   ├── projects/       # Project management
│   │   ├── settings/       # User settings
│   │   └── admin/          # Admin dashboard
│   ├── api/                # API routes
│   │   ├── auth/           # Authentication endpoints
│   │   ├── chat/           # Chat & streaming
│   │   ├── projects/       # Project CRUD
│   │   ├── sandbox/        # Sandbox management
│   │   ├── tools/          # Tool execution
│   │   └── admin/          # Admin endpoints
│   └── layout.tsx
├── components/             # React components
│   ├── chat/               # Chat UI components
│   ├── sidebar/            # Left sidebar
│   ├── tools-panel/        # Right panel
│   ├── terminal/           # Terminal emulator
│   ├── file-explorer/      # File browser
│   ├── browser-preview/    # Browser preview
│   └── ui/                 # Shared UI components
├── lib/                    # Shared libraries
│   ├── db/                 # Prisma client & utilities
│   ├── ai/                 # AI provider adapters
│   ├── sandbox/            # Sandbox manager
│   ├── tools/              # Tool definitions & executor
│   ├── auth/               # Auth utilities
│   └── utils/              # General utilities
├── prisma/                 # Database schema & migrations
├── sandbox/                # Sandbox Docker image
├── public/                 # Static assets
├── types/                  # TypeScript type definitions
├── docker-compose.yml      # Docker Compose for development
├── Dockerfile              # App Dockerfile
└── tests/                  # Test files
```

## Database Schema (PostgreSQL + Prisma)

### Tables

1. **users** — User accounts
2. **projects** — User projects/workspaces
3. **conversations** — Chat conversations within projects
4. **messages** — Individual chat messages
5. **tool_calls** — Tool execution records
6. **approvals** — Pending and completed approvals
7. **audit_logs** — Full audit trail
8. **sandboxes** — Active sandbox containers
9. **file_snapshots** — Version history / rollback points
10. **project_templates** — Starter templates

### Key Relationships
- User → has many Projects
- Project → has many Conversations, Sandboxes, FileSnapshots
- Conversation → has many Messages
- Message → has many ToolCalls
- ToolCall → has one Approval (optional)

## API Contract

### Authentication
```
POST   /api/auth/register     — Create account
POST   /api/auth/login        — Sign in
POST   /api/auth/logout       — Sign out
GET    /api/auth/session      — Get current session
```

### Projects
```
GET    /api/projects           — List user projects
POST   /api/projects           — Create project
GET    /api/projects/:id       — Get project details
PATCH  /api/projects/:id       — Update project
DELETE /api/projects/:id       — Delete project
POST   /api/projects/:id/snapshot — Create snapshot
GET    /api/projects/:id/snapshots — List snapshots
POST   /api/projects/:id/rollback/:snapshotId — Rollback
```

### Conversations
```
GET    /api/projects/:pid/conversations        — List conversations
POST   /api/projects/:pid/conversations        — Create conversation
GET    /api/conversations/:id                   — Get conversation with messages
PATCH  /api/conversations/:id                   — Rename/update
DELETE /api/conversations/:id                   — Delete conversation
GET    /api/conversations/:id/export            — Export conversation
```

### Chat & Streaming
```
POST   /api/chat/stream        — Send message, get SSE stream
GET    /api/chat/stream/:id    — Resume SSE stream
```

### Sandbox
```
POST   /api/sandbox/create     — Create/start sandbox for project
GET    /api/sandbox/:id/status — Get sandbox status
POST   /api/sandbox/:id/stop   — Stop sandbox
DELETE /api/sandbox/:id        — Destroy sandbox
GET    /api/sandbox/:id/preview — Get live preview URL
```

### Tools
```
POST   /api/tools/execute      — Execute a tool (with approval check)
GET    /api/tools/history/:id  — Get tool call history
POST   /api/tools/approve/:id  — Approve pending tool call
POST   /api/tools/reject/:id   — Reject pending tool call
POST   /api/tools/cancel/:id   — Cancel running tool call
```

### Files (inside sandbox)
```
GET    /api/files/:sandboxId/list      — List files
GET    /api/files/:sandboxId/read      — Read file
POST   /api/files/:sandboxId/write     — Write file
POST   /api/files/:sandboxId/mkdir     — Create directory
DELETE /api/files/:sandboxId/delete    — Delete file
POST   /api/files/:sandboxId/rename    — Rename file
GET    /api/files/:sandboxId/download  — Download file
POST   /api/files/:sandboxId/upload    — Upload file
```

### Terminal
```
POST   /api/terminal/:sandboxId/exec   — Execute command
WS     /api/terminal/:sandboxId/stream — Live terminal stream
```

### Approvals
```
GET    /api/approvals                  — List pending approvals
GET    /api/approvals/:id              — Get approval details
POST   /api/approvals/:id/approve     — Approve action
POST   /api/approvals/:id/reject      — Reject action
```

### Audit
```
GET    /api/audit                      — List audit events
GET    /api/audit/export               — Export audit log
```

## Tool System

### Built-in Tools

| Tool | Permission Level | Description |
|------|-----------------|-------------|
| `file_read` | Read-only | Read file contents |
| `file_write` | Approval Required | Write/edit files |
| `file_delete` | Approval Required | Delete files |
| `file_list` | Read-only | List directory contents |
| `terminal_exec` | Approval Required | Run shell commands |
| `code_run` | Approval Required | Run Python/JS code |
| `browser_navigate` | Approval Required | Browse web pages |
| `browser_screenshot` | Read-only | Take screenshots |
| `package_install` | Approval Required | Install packages |
| `server_start` | Approval Required | Start dev servers |
| `server_stop` | Approval Required | Stop dev servers |
| `search_web` | Read-only | Web search |
| `screenshot_desktop` | Read-only | Desktop screenshot |

### Tool Call Flow
```
User Message → AI Model → Tool Call Request
  → Permission Check
    → [Read-only] → Execute immediately → Return result
    → [Approval Required] → Show approval dialog → Wait for user
      → [Approved] → Execute → Return result
      → [Rejected] → Notify AI → AI explains to user
    → [Blocked] → Reject immediately → Notify AI
```

## Sandbox Architecture

```
┌─────────────────────────────────────────────┐
│                 Host Machine                 │
│                                              │
│  ┌─────────────┐    ┌─────────────────────┐ │
│  │  Next.js App │    │  Docker Engine      │ │
│  │  (Port 3000) │    │                     │ │
│  │              │    │  ┌───────────────┐  │ │
│  │  API Routes ─┼────┼──│ Sandbox #1    │  │ │
│  │              │    │  │ (Project A)   │  │ │
│  │  SSE Stream  │    │  │ Ubuntu + tools │  │ │
│  │              │    │  │ Port 8080     │  │ │
│  │  WebSocket   │    │  └───────────────┘  │ │
│  └─────────────┘    │                     │ │
│                      │  ┌───────────────┐  │ │
│  ┌─────────────┐    │  │ Sandbox #2    │  │ │
│  │ PostgreSQL   │    │  │ (Project B)   │  │ │
│  │ (Port 5432)  │    │  │ Ubuntu + tools │  │ │
│  └─────────────┘    │  └───────────────┘  │ │
│                      └─────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Sandbox Container Spec
- Base: Ubuntu 22.04 with Node.js, Python3, common dev tools
- Resource limits: CPU (2 cores), Memory (2GB), Disk (10GB)
- Network: Isolated network, no host access
- Filesystem: Mounted volume per project
- Ports: Dynamically allocated (8080-9080 range)
- User: Non-root sandbox user

## Security Model

1. **Sandbox Isolation** — Each project runs in its own Docker container
2. **Permission Levels** — Read-only, Approval Required, Always Blocked
3. **Approval Queue** — Real-time approval UI for sensitive operations
4. **Audit Logging** — Every action logged with timestamp, user, tool, args, result
5. **Secret Management** — Encrypted env vars, never exposed to chat/logs
6. **Rate Limiting** — Per-user and per-tool rate limits
7. **Resource Limits** — CPU, memory, disk, network limits on sandboxes
8. **Input Validation** — Strict validation on all API inputs
9. **CORS/CSP** — Proper security headers
10. **Session Security** — HTTP-only cookies, CSRF protection

## Build Order

1. ✅ Architecture & project structure
2. Database schema & Prisma setup
3. Authentication system
4. Project management
5. Chat interface with streaming
6. Sandbox manager
7. File tools & terminal tools
8. Approval & audit system
9. Browser automation
10. Live preview panel
11. Version history & rollback
12. Tests, docs, Docker Compose, security hardening