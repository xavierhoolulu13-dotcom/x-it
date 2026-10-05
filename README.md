# X-IT — Personal AI Computer Assistant

> A full-stack web application combining AI chat, sandbox computer control, tool execution, and app building into one polished personal AI workspace.

![X-IT](https://img.shields.io/badge/X--IT-v0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## ✨ Features

### 💬 Chat Interface
- Modern ChatGPT-style interface with streaming responses
- Multiple conversations with search, rename, delete, and export
- Markdown rendering with code blocks, tables, images, and file uploads
- Model selection, temperature controls, system-prompt controls, and token limits
- Light mode, dark mode, responsive mobile layout, and keyboard shortcuts

### 🖥️ AI Computer Environment
- Isolated Docker sandbox containers — never your host machine
- File operations: create, read, edit, rename, delete
- Shell command execution with approval controls
- Python, JavaScript, and multi-language code execution
- Browser automation with screenshots
- Live preview of generated websites and applications

### 🔧 Tool System
- Function-calling architecture with clear tool definitions
- Every tool call shows: name, arguments, reason, result, and timestamp
- Permission levels: Read-only, Approval Required, Always Blocked
- Real-time approval queue for sensitive operations

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

### 🌐 Open WebUI-Style Features
- Multiple provider support (OpenAI, Ollama, custom)
- Configurable model adapter layer
- Per-project system prompts and tool permissions
- Model health checks and clear error messages

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

- **Node.js** 20+
- **Docker** and **Docker Compose**
- **PostgreSQL** (or use Docker Compose)

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/x-it.git
cd x-it

# Copy environment file
cp .env.example .env
# Edit .env with your settings (especially OPENAI_API_KEY)

# Build sandbox image
docker build -t x-it-sandbox ./sandbox

# Start everything
docker compose up -d

# Run database migrations
docker compose exec app npx prisma db push

# Seed the database
docker compose exec app npx prisma db seed

# Open http://localhost:3000
```

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your settings

# Set up database
npx prisma generate
npx prisma db push
npx prisma db seed

# Build sandbox image (requires Docker)
docker build -t x-it-sandbox ./sandbox

# Start development server
npm run dev

# Open http://localhost:3000
```

### Default Login

- **Email:** `demo@xit.dev`
- **Password:** `demo1234`

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
│   ├── ai/                 # AI provider adapter layer
│   ├── db/                 # Prisma client
│   ├── sandbox/            # Docker sandbox manager
│   ├── stores/             # Zustand state management
│   ├── tools/              # Tool definitions and executor
│   └── utils.ts            # Utility functions
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

- ✅ Sandbox isolation via Docker containers
- ✅ Non-root user inside containers
- ✅ CPU, memory, disk, and process limits
- ✅ Network isolation
- ✅ No host filesystem access from sandbox
- ✅ Secrets encrypted, never in chat/logs
- ✅ Full audit trail of every action
- ✅ Emergency stop button

## 🛠️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` | App URL |
| `NEXTAUTH_SECRET` | Yes | — | Session encryption secret |
| `OPENAI_API_KEY` | No | — | OpenAI API key |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `DEFAULT_MODEL` | No | `gpt-4` | Default AI model |
| `DOCKER_HOST` | No | `unix:///var/run/docker.sock` | Docker socket path |
| `SANDBOX_BASE_IMAGE` | No | `x-it-sandbox:latest` | Docker image for sandboxes |
| `ENCRYPTION_KEY` | Yes | — | Key for encrypting secrets |

### Adding Custom AI Providers

Edit `lib/ai/provider-adapter.ts` to add new providers:

```typescript
// Register a new provider
const registry = getProviderRegistry();
registry.register(new MyCustomProvider(apiKey, baseUrl));
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm test -- --grep "auth"
npm test -- --grep "chat"
npm test -- --grep "sandbox"
npm test -- --grep "permissions"
```

### Test Coverage

- [x] Authentication (register, login, session)
- [x] Chat streaming (SSE, tool calls)
- [x] Permissions (approval flow, blocked actions)
- [x] Tool execution (file ops, terminal, code)
- [x] Sandbox isolation (Docker containers)
- [x] Approval flow (approve, reject, timeout)
- [x] Rollback (snapshots, restore)
- [x] Audit logging

## 📦 Production Deployment

### Security Checklist

- [ ] Change `NEXTAUTH_SECRET` to a strong random string
- [ ] Change `ENCRYPTION_KEY` to a strong random string
- [ ] Use strong database credentials
- [ ] Enable HTTPS
- [ ] Set up proper CORS headers
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerting
- [ ] Review and restrict sandbox resource limits
- [ ] Enable audit log export to SIEM
- [ ] Set up database backups

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start

# Or use Docker Compose
docker compose -f docker-compose.yml up -d
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

**Built with:** Next.js 14, React, TypeScript, Tailwind CSS, Prisma, PostgreSQL, Docker, Zustand