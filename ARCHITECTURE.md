# Personal AI Computer Assistant — Architecture

## Overview

A full-stack web application combining AI chat, sandbox computer control, tool execution, and app building into one polished personal AI workspace.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend API | Next.js API Routes + Server Actions |
| Persistence | Durable JSON store (atomic writes) — `lib/db/store.ts`; Prisma schema for PostgreSQL deployments |
| Real-time | Server-Sent Events (SSE) for chat streaming and tool events |
| Sandbox | Pluggable backends: Docker containers (dockerode) or a hardened local backend |
| Auth | NextAuth.js — credentials (bcrypt) + env-gated GitHub/Google OAuth |
| Browser | Real headless Chromium via puppeteer-core |
| AI Providers | OpenAI-compatible, Ollama, and an offline demo agent |

## Repository Structure

```
x-it/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # login, register
│   ├── (dashboard)/            # chat, settings (protected by middleware)
│   ├── api/                    # REST + SSE endpoints (see API Contract)
│   │   ├── auth/               # NextAuth + registration
│   │   ├── chat/               # SSE agent stream
│   │   ├── browser/            # browser sessions, actions, screenshots, content
│   │   ├── sandbox/            # sandbox lifecycle
│   │   ├── terminal/           # command execution
│   │   ├── files/              # workspace file operations
│   │   ├── tools/              # catalogue, execution, history
│   │   ├── approvals/          # approval queue + decisions
│   │   ├── audit/              # audit trail
│   │   ├── preview/            # preview proxy
│   │   ├── projects/           # projects + snapshots
│   │   ├── health/, version/   # operations
│   │   └── models/             # provider + model catalogue
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── auth/                   # AuthForm
│   ├── chat/                   # message list, tool-call cards, input
│   ├── sidebar/                # projects + conversations
│   ├── tools-panel/            # tabs: tools, files, terminal, browser, approvals, audit
│   ├── ui/                     # shared primitives
│   ├── dashboard-shell.tsx     # layout composition
│   └── top-bar.tsx             # model selector, status, stop button
├── lib/
│   ├── ai/                     # provider-adapter (OpenAI, Ollama, demo agent)
│   ├── auth/                   # auth-options, passwords, session, secret
│   ├── browser/                # chromium, engine, extract, types
│   ├── db/                     # store (durable JSON) + Prisma client
│   ├── hooks/                  # use-sandbox
│   ├── runtime/                # paths
│   ├── sandbox/                # docker-backend, local-backend, manager, types
│   ├── stores/                 # zustand: chat, ui
│   ├── tools/                  # definitions, policy, executor, approvals, errors
│   └── util/                   # api helpers, rate limiting
├── middleware.ts               # route protection
├── scripts/
│   ├── prepare-chromium.mjs    # resolve/extract Chromium
│   └── e2e-production.mjs      # production E2E (headless Chromium)
├── tests/                      # vitest suites
├── sandbox/                    # sandbox container image
├── prisma/                     # PostgreSQL schema (optional)
├── Dockerfile                  # production image (Chromium + toolchain)
└── docker-compose.yml
```

## Runtime Data Model

The running application persists through `lib/db/store.ts`, a durable JSON store with
atomic writes covering: `users`, `projects`, `conversations`, `messages`, `toolCalls`,
`approvals`, `auditLogs`, `snapshots`, `sandboxes` and `browserSessions`. Data lives in
`X_IT_DATA_DIR` (default `./.x-it-data`) alongside `workspaces/`, `browser/` and the
generated NextAuth secret. `prisma/schema.prisma` mirrors this model for PostgreSQL
deployments.

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

All `/api/*` routes (except auth, health and version) require a NextAuth session cookie
or `Authorization: Bearer $X_IT_API_TOKEN`.

### Authentication
```
POST  /api/auth/register                    — create account (rate limited)
GET/POST /api/auth/[...nextauth]            — NextAuth sign-in/session/callbacks
```

### Chat & conversations
```
POST  /api/chat/stream                      — send message, receive SSE stream
GET   /api/conversations                    — list conversations
GET   /api/conversations/:id                — conversation with messages + tool calls
PATCH /api/conversations/:id                — rename
DELETE /api/conversations/:id               — delete
GET   /api/models                           — available models + active provider
```

### Projects & snapshots
```
GET/POST /api/projects                      — list / create projects
GET/PATCH/DELETE /api/projects/:id          — project detail
GET/POST /api/projects/:id/snapshots        — list / capture workspace snapshot
POST  /api/projects/:id/snapshots/:sid/restore — restore snapshot
```

### Sandbox & execution
```
GET   /api/sandbox                          — current sandbox for the active project
POST  /api/sandbox/create                   — create/start (optional recreate)
GET   /api/sandbox/:id/status               — status + backend
POST  /api/sandbox/:id/stop                 — stop
POST  /api/terminal/:sandboxId/exec         — run a command (403 when policy-blocked)
POST  /api/files/:sandboxId/list|read|write|delete|mkdir|rename
GET   /api/preview/:sandboxId/*             — proxy to a server running in the sandbox
```

### Tools, approvals & audit
```
GET   /api/tools                            — catalogue + permission tiers
POST  /api/tools/execute                    — execute a tool directly
GET   /api/tools/history                    — recent tool calls
GET   /api/approvals                        — pending/decided approvals
POST  /api/approvals/:id/decision           — { decision, reason? }
POST  /api/approvals/:id/approve|reject     — convenience aliases
GET   /api/audit                            — audit trail
```

### Browser automation
```
GET   /api/browser/status                   — Chromium readiness
POST  /api/browser/sessions                 — create session (name, url, viewport)
GET   /api/browser/sessions/:id             — page state (url, title, elements, count)
POST  /api/browser/sessions/:id/navigate    — navigate to a URL
POST  /api/browser/sessions/:id/action      — click/type/scroll/back/forward/reload/viewport
POST  /api/browser/sessions/:id/screenshot  — capture (png|jpeg, fullPage)
GET   /api/browser/sessions/:id/screenshot  — screenshot bytes
GET   /api/browser/sessions/:id/content     — html|text|markdown|links
```

### Operations
```
GET   /api/health                           — store, sandbox and AI checks
GET   /api/version                          — version, milestones, features
```

## Tool System

### Built-in Tools

| Tool | Permission Level | Description |
|------|-----------------|-------------|
| `file_read` | read_only | Read file contents |
| `file_list` | read_only | List files and directories |
| `file_write` | approval_required | Write/overwrite a file |
| `file_delete` | approval_required | Delete a file or directory |
| `terminal_exec` | approval_required | Run a shell command |
| `code_run` | approval_required | Run Python/JS/TS/bash/Ruby code |
| `server_start` | approval_required | Start a long-running sandbox server |
| `server_stop` | approval_required | Stop a sandbox server |
| `browser_navigate` | approval_required | Navigate a browser session |
| `browser_action` | approval_required | Click/type/scroll/back/forward |
| `browser_screenshot` | read_only | Capture the current page |
| `browser_extract` | read_only | Extract HTML/text/markdown/links |
| `browser_close` | read_only | Close a browser session |
| `search_web` | read_only | Search from inside the sandbox browser |
| `snapshot_create` | read_only | Capture a workspace snapshot |
| `host_escape`, `credential_access` | always_blocked | Never exposed to the model |

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

## Browser Automation

```
Chat / Browser tab / REST API
        │
        ▼
lib/browser/engine.ts   BrowserEngine
  ├── session registry (per user, idle-shutdown after BROWSER_IDLE_SHUTDOWN_MS)
  ├── navigate / click / type / scroll / viewport / back-forward
  ├── screenshot (png|jpeg, fullPage)  ──┐
  └── content (html|text|markdown|links) │
        │                                │
        ▼                                ▼
lib/browser/chromium.ts          lib/browser/extract.ts
  resolveChromium()  ─ scripts/prepare-chromium.mjs
  chromiumEnv()      ─ LD_LIBRARY_PATH / FONTCONFIG_PATH / HOME
  launchChromium()   ─ puppeteer-core, filtered launch flags
        │
        ▼
normalizeUrl()  SSRF guard: http/https only, private ranges blocked
                (opt-in via X_IT_ALLOW_PRIVATE_NETWORK for local previews)
```

Launch flags that break multi-context operation (`--single-process`,
`--disable-web-security`, `--allow-running-insecure-content`) are stripped by
`BLOCKED_FLAGS` in `dedupeArgs()`; without that, any second browser context dies with
`Target closed`.

## Tool Execution Path

```
app/api/chat/stream (agent loop)   app/api/tools/execute   automation
                    \                    |                  /
                     ▼                   ▼                 ▼
                          lib/tools/executor.ts
        ┌────────────────────────┼─────────────────────────┐
        ▼                        ▼                         ▼
  permission check          approval gate             audit log
  (tool-definitions)     (approval-broker +        (store.addAuditLog,
        │                 lib/tools/approvals)      secrets redacted)
        ▼                        ▼
  policy + path jail      user decision
  (lib/tools/policy)      (/api/approvals/...)
        │
        ▼
  SandboxManager → DockerBackend | LocalBackend
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
│  │   SSE/Exec   │    │  └───────────────┘  │ │
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

## Verification

| Layer | Command | Result |
|-------|---------|--------|
| Types | `npm run typecheck` | 0 errors |
| Build | `npm run build` | 45 routes |
| Unit/integration | `npm run test` | 79 tests (real Chromium + real shell execution) |
| Production E2E | `scripts/e2e-production.mjs` | 18/18 checks on `next start` |

## Security Model

1. **Sandbox isolation** — Docker container per project when available; otherwise the
   local backend confines every operation to the project workspace.
2. **Path jail** — `resolveWorkspacePath()` rejects any path that escapes the workspace.
3. **Command policy** — `checkCommand()` blocks destructive host commands, reverse
   shells, credential reads and pipe-to-shell installs before execution.
4. **Permission levels** — read_only, approval_required, always_blocked (the last tier is
   never exposed to the model).
5. **Approval queue** — Sensitive tools park the agent loop until the user decides;
   requests expire after `APPROVAL_TIMEOUT_SECONDS`.
6. **Audit logging** — Every tool call, approval and auth event is stored with user,
   arguments and result; secret-looking arguments are redacted.
7. **SSRF protection** — Browser navigation and the preview proxy reject non-HTTP
   schemes and private network ranges unless explicitly opted in.
8. **Secret management** — `NEXTAUTH_SECRET` is generated/stored locally; provider keys
   stay server-side and are never sent to the model or written to the audit log.
9. **Rate limiting** — Registration (10/hour/IP) and login (10/min per email+IP).
10. **Session security** — HTTP-only JWT session cookies (30 days), CSRF protection via
    NextAuth, middleware-enforced dashboard routes.
11. **Input validation** — Zod schemas on API bodies.

## Build Order

1. ✅ Architecture & project structure
2. ✅ Persistence layer (durable JSON store + Prisma schema for Postgres)
3. ✅ Authentication system (v2)
4. ✅ Project management
5. ✅ Chat interface with streaming and the agent tool loop (v3)
6. ✅ Sandbox manager (docker + local backends)
7. ✅ File tools & terminal tools
8. ✅ Approval & audit system
9. ✅ Browser automation (v2)
10. ✅ Live preview proxy
11. ✅ Snapshots & restore
12. ✅ Tests, docs, Docker, security hardening (v3)

## Release History

| Tag | Milestone |
|-----|-----------|
| `v1.0.0` | Chat UI, tool catalogue, approvals UI |
| `v2.0.0` | Real authentication + real browser automation |
| `v3.0.0` | Full completion: real execution, providers, approvals, audit, tests, E2E |