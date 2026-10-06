# X-IT — Personal AI Computer Assistant

> A full-stack web application combining AI chat, sandbox computer control, tool execution, and app building into one polished personal AI workspace.

**Status:** v3.0.0 — verified end-to-end. Real authentication, real headless-Chromium browser
automation, real sandbox execution and a real agent tool loop with approvals, audit trail,
live preview and snapshots. 79 unit/integration tests plus 18 production E2E checks driven
by a real browser against `next build` + `next start`.

**Milestones:** v1 — chat UI and tool catalogue · v2 — real authentication and real browser
automation · **v3 — full completion**: real sandbox execution, real provider streaming with
the agent tool loop, approvals, audit log, preview proxy, snapshots and verified end-to-end
tests against a production build. See [CHANGELOG.md](CHANGELOG.md) for details.

![X-IT](https://img.shields.io/badge/version-v3.0.0-blue)
![Tests](https://img.shields.io/badge/tests-79%20passing-brightgreen)
![E2E](https://img.shields.io/badge/production%20E2E-18%2F18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 💬 Chat Interface
- Modern ChatGPT-style interface with streaming responses
- Multiple conversations with search, rename, delete, and export
- Markdown rendering with code blocks, tables, images, and file uploads
- Model selection, temperature controls, system-prompt controls, and token limits
- Light mode, dark mode, responsive mobile layout, and keyboard shortcuts

### 🖥️ AI Computer Environment
- Real sandbox execution — Docker containers when available, or a hardened local
  backend (workspace path jail + command policy) on hosts without Docker
- File operations: create, read, edit, rename, delete, mkdir
- Shell command execution with approval controls and a destructive-command policy
- Python, JavaScript, and multi-language code execution
- Live preview proxy for servers started inside the sandbox
- Workspace snapshots with restore

### 🔧 Tool System
- 16 built-in tools behind one execution path (chat, REST API and automation)
- Every tool call shows: name, arguments, reason, result, and timestamp
- Permission levels: Read-only, Approval Required, Always Blocked
- Real-time approval queue for sensitive operations
- Full audit trail with secret redaction

### 🌍 Browser Automation
- Real headless Chromium driven by puppeteer-core
- Navigate, click (selector or coordinates), type, scroll, viewport control
- Screenshots (full-page support) and content extraction (HTML/text/markdown/links)
- SSRF guard: scheme allow-list + private-network blocking
- Live Browser tab with click-to-interact mapping

### 🛡️ Safety & Permissions
- Three-tier permission system
- Confirmation before destructive actions
- Emergency stop button
- Resource limits (CPU, memory, disk, network)
- Full audit logging of every action
- Encrypted secrets management
- Host machine isolation

### 🤖 AI Builder
- Describe apps in natural language
- Generate project plans, file trees, and source code
- Live preview panel for running applications
- Version history, snapshots, and rollback
- Project templates for common patterns

### 🌐 Providers & Models
- OpenAI-compatible streaming (OpenAI, vLLM, LM Studio, OpenRouter, …)
- Native Ollama support with tool calling
- Offline demo agent: plans and executes real tools with no API key
- Per-project system prompts, model selection and live health checks

### 🔐 Real Authentication
- Credentials login/registration with bcrypt hashing (cost 12)
- 30-day JWT sessions, protected dashboard routes, callback-URL round-trip
- Env-gated GitHub and Google OAuth
- Rate limiting on registration and login
- Static API token (`X_IT_API_TOKEN`) for CI and automation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser (Frontend)               │
│         Next.js 14 + React + Tailwind CSS        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Sidebar  │  │   Chat   │  │  Tools Panel  │  │
│  │ Projects  │  │ Interface │  │ Files/Terminal│  │
│  │  Convos   │  │ Streaming │  │ Approvals     │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────┐
│                 Next.js API Layer                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ Auth     │ │ Chat     │ │ Sandbox Mgr   │    │
│  │ Session  │ │ Stream   │ │ Tool Executor │    │
│  └──────────┘ └──────────┘ └──────────────┘    │
└────────┬────────────┬──────────────┬────────────┘
         │            │              │
┌────────┴───┐ ┌──────┴──────┐ ┌────┴──────────┐
│ PostgreSQL │ │  AI Provider │ │ Docker Engine  │
│  Database   │ │  (OpenAI/   │ │ Sandboxes     │
│  (Prisma)   │ │   Ollama)   │ │ (Isolated)    │
└─────────────┘ └─────────────┘ └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ (22+ recommended — the bundled Chromium requires it)
- **Docker** *(optional)* — used for sandbox containers when reachable
- No database is required: X-IT ships a durable JSON store, and a Prisma schema for
  Postgres deployments

### Local (npm)

```bash
git clone https://github.com/xavierhoolulu13-dotcom/x-it.git
cd x-it

npm ci --prefer-offline --no-audit --no-fund
cp .env.example .env            # set NEXTAUTH_SECRET (openssl rand -hex 32)

npm run dev                     # http://localhost:3000
```

Production:

```bash
npm run build
NEXTAUTH_SECRET=... npx next start -p 3000 -H 0.0.0.0
```

### Docker Compose

```bash
cp .env.example .env            # set NEXTAUTH_SECRET (required)
docker compose up -d --build    # app on http://localhost:3000
```

The image bundles Chromium and the sandbox toolchain, so a single container can run
the app, drive a browser and execute tools. Compose also mounts the Docker socket so
sandboxes can run as sibling containers; remove that mount to use the hardened local
backend instead.

### Default Login

- **Email:** `demo@xit.dev`
- **Password:** `demo1234`

Set `X_IT_DEMO_AUTOLOGIN=true` to skip the login step entirely: the landing page
redirects to `/demo`, signs into that demo account and drops you in the dashboard.
It never touches an existing session and only ever authenticates the demo account.

### AI provider

X-IT works with no credentials at all: without a provider it runs the **demo agent**,
which still executes real tools. To use a real model, set `OPENAI_API_KEY` (any
OpenAI-compatible endpoint works) or `OLLAMA_BASE_URL` in `.env`.

## 📁 Project Structure

```
x-it/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Authentication pages
│   ├── (dashboard)/        # Main app layout
│   │   ├── chat/           # Chat interface
│   │   ├── settings/       # User settings
│   │   └── layout.tsx      # Dashboard layout (sidebar + top bar + tools panel)
│   └── api/                # API routes
│       ├── chat/           # Chat streaming endpoints
│       ├── sandbox/        # Sandbox management
│       ├── terminal/       # Terminal execution
│       └── files/          # File operations
├── components/             # React components
│   ├── chat/               # Chat UI (messages, input, tool cards)
│   ├── sidebar/            # Left sidebar (projects, conversations)
│   ├── tools-panel/        # Right panel (tools, files, terminal, approvals)
│   ├── ui/                 # Shared UI primitives (Button, Input)
│   └── top-bar.tsx         # Top bar (model selector, status, emergency stop)
├── lib/                    # Core libraries
│   ├── ai/                 # Provider adapters (OpenAI-compatible, Ollama, demo agent)
│   ├── auth/               # NextAuth options, passwords, session helpers
│   ├── browser/            # Chromium resolution, browser engine, content extraction
│   ├── db/                 # Durable JSON store (+ Prisma client)
│   ├── sandbox/            # Sandbox backends (docker, local) and manager
│   ├── stores/             # Zustand state management
│   ├── tools/              # Tool definitions, policy, executor, approvals
│   └── utils.ts            # Utility functions
├── scripts/                # Chromium bootstrap + production E2E harness
│   ├── prepare-chromium.mjs
│   └── e2e-production.mjs
├── prisma/                 # Database schema and seed
│   ├── schema.prisma       # Full database schema
│   └── seed.ts             # Database seeder
├── sandbox/                # Sandbox Docker image
│   ├── Dockerfile          # Ubuntu + Node.js + Python + Chromium
│   └── entrypoint.sh       # Container entrypoint
├── docker-compose.yml      # Full stack Docker Compose
├── Dockerfile              # App production Dockerfile
└── README.md               # This file
```

## 🔐 Security Model

### Permission Levels

| Level | Description | Examples |
|-------|-------------|---------|
| **Read-only** | No approval needed | Read files, list directories, take screenshots, search web |
| **Approval Required** | User must approve | Write files, run commands, install packages, navigate browser |
| **Always Blocked** | Never allowed | Host access, credential theft, malware, destructive host actions |

### Approval Flow

```
AI wants to execute tool
  → Check permission level
  → [Read-only] → Execute → Show result
  → [Approval] → Show approval dialog → Wait for user
    → [Approved] → Execute → Show result
    → [Rejected] → Tell AI → AI adapts
  → [Blocked] → Reject → Tell AI action not allowed
```

### What's Protected

- ✅ Docker isolation when available; hardened workspace jail + command policy otherwise
- ✅ Non-root user inside containers, with CPU/memory limits
- ✅ Path jail prevents any file operation from escaping the project workspace
- ✅ Command policy blocks destructive host operations, reverse shells and credential reads
- ✅ SSRF guard on browser automation and preview (private networks blocked by default)
- ✅ Secret-looking tool arguments redacted from the audit trail
- ✅ Full audit trail of every tool call, approval and auth event
- ✅ Emergency stop button

## 🛠️ Configuration

### Environment Variables

See [`.env.example`](.env.example) for the complete annotated list.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | Yes | — | Session encryption secret (`openssl rand -hex 32`) |
| `NEXTAUTH_URL` | No | — | Public app URL for OAuth callbacks |
| `X_IT_DATA_DIR` | No | `./.x-it-data` | Durable state: store, workspaces, browser sessions |
| `X_IT_FRAME_ANCESTORS` | No | `'self'` + preview hosts | Hosts allowed to embed the app (CSP `frame-ancestors`) |
| `X_IT_DEMO_AUTOLOGIN` | No | `false` | `true` makes `/` sign straight into the demo account (zero-click demos) |
| `OPENAI_API_KEY` | No | — | Enables an OpenAI-compatible provider |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `DEFAULT_MODEL` | No | `gpt-4o-mini` | Default model id |
| `OLLAMA_BASE_URL` | No | — | Local Ollama endpoint |
| `SANDBOX_BACKEND` | No | `auto` | `auto` \| `docker` \| `local` |
| `DOCKER_HOST` | No | `unix:///var/run/docker.sock` | Docker socket |
| `X_IT_CHROME_EXECUTABLE_PATH` | No | bundled | Chromium binary for browser automation |
| `X_IT_API_TOKEN` | No | — | Bearer token for machine API access |
| `APPROVAL_TIMEOUT_SECONDS` | No | `300` | How long an approval may wait |
| `X_IT_AUTO_APPROVE` | No | `false` | Skip the approval queue (automation only) |
| `X_IT_ALLOW_PRIVATE_NETWORK` | No | `false` | Allow browser navigation to private addresses |

### Adding Custom AI Providers

Implement the `AIProvider` interface in `lib/ai/provider-adapter.ts` and extend
`resolveProvider()`; the chat route, tool loop and `/api/models` pick it up automatically.

## 🧪 Testing

```bash
npm run typecheck     # tsc --noEmit
npm run test          # vitest run — 79 unit/integration tests
npm run test:watch    # watch mode
npm run e2e           # production E2E (requires a running server, see below)
```

### What the tests cover

| Suite | Contents |
|-------|----------|
| `tests/auth.test.ts` | password policy, bcrypt, email handling, rate limiting, user store |
| `tests/policy.test.ts` | allow/block command corpus, workspace path jail |
| `tests/sandbox.test.ts` | real command execution, timeouts, policy refusal, file ops, server start + port pool, snapshots |
| `tests/tools.test.ts` | permission tiers, approval queue (approve/reject), policy enforcement, audit redaction |
| `tests/browser.test.ts` | real Chromium: sessions, navigation, click/type, isolation, screenshots; SSRF guard |
| `tests/provider.test.ts` | OpenAI-compatible SSE parsing, Ollama NDJSON, demo agent planning, resolution |

### Production end-to-end verification

`scripts/e2e-production.mjs` builds nothing itself — it drives an already-running
production server with real headless Chromium and real API calls, then exits non-zero
if anything fails. It authenticates as a freshly registered user (session cookie) and
verifies signup, access control, chat agent tool execution, sandbox files, terminal
policy, `code_run`, browser automation with screenshots, the preview proxy, approvals
and the audit trail.

```bash
npm run build
NEXTAUTH_SECRET=$(openssl rand -hex 32) X_IT_API_TOKEN=e2e-token \
  npx next start -p 3100 -H 0.0.0.0 &

BASE_URL=http://127.0.0.1:3100 X_IT_API_TOKEN=e2e-token \
  node scripts/e2e-production.mjs
# → 18 passed, 0 failed — screenshots + report in ./artifacts
```

## 📦 Production Deployment

### Security Checklist

- [ ] Set a strong `NEXTAUTH_SECRET` (and rotate it on a schedule)
- [ ] Enable HTTPS and set `NEXTAUTH_URL` to the public origin
- [ ] Prefer `SANDBOX_BACKEND=docker` for untrusted workloads
- [ ] Review the command policy for your environment (`lib/tools/policy.ts`)
- [ ] Keep `X_IT_ALLOW_PRIVATE_NETWORK` disabled unless previews require it
- [ ] Issue `X_IT_API_TOKEN` only to trusted automation; rotate regularly
- [ ] Back up `X_IT_DATA_DIR` (store, workspaces, audit log)
- [ ] Register an OAuth app if you enable GitHub/Google sign-in

### Production Build

```bash
npm run build
NEXTAUTH_SECRET=... npx next start -p 3000 -H 0.0.0.0

# Or build and run the container (includes Chromium + sandbox toolchain)
docker build -t x-it .
docker run -p 3000:3000 -e NEXTAUTH_SECRET=... -v xit-data:/app/data x-it
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built with:** Next.js 14, React, TypeScript, Tailwind CSS, NextAuth, Puppeteer/Chromium,
Docker, Zustand — see [CHANGELOG.md](CHANGELOG.md) for the v1 → v3 milestone history.