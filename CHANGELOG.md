# Changelog

All notable changes to X-IT. This project follows [Semantic Versioning](https://semver.org/).

## [3.0.0] — Full completion

The complete, verified product: every tool call runs for real, in production, with a real browser.

### Added — sandbox & execution
- Real sandbox runtime with two interchangeable backends:
  - `LocalBackend` — hardened host execution (workspace path jail, command policy,
    detached processes, port pool, 200 KB output cap, timeouts) for hosts without Docker.
  - `DockerBackend` — one container per project via dockerode with resource limits.
- `SandboxManager` with backend auto-detection (`SANDBOX_BACKEND=auto|docker|local`),
  per-project workspace reuse, file capture/restore for snapshots, and running-server registry.
- Command policy engine (`lib/tools/policy.ts`): blocks destructive host commands, reverse
  shells, credential access and pipe-to-shell installs; path jail rejects workspace escapes.
- Preview proxy (`/api/preview/{sandboxId}/{path*}`) that forwards to servers started inside a sandbox.
- Project snapshots: capture and restore the workspace (`/api/projects/{id}/snapshots`).

### Added — tool system
- 16 built-in tools with three permission tiers: read-only, approval-required, always-blocked.
- Single execution path (`lib/tools/executor.ts`) for chat, REST API and automation —
  policy checks, approval gating, audit logging and secret redaction happen in one place.
- Approval broker: pending requests block the agent loop, resume on decision, and expire
  after `APPROVAL_TIMEOUT_SECONDS`. REST decisions (`/api/approvals/...`) and the
  in-process waiter share one code path (`lib/tools/approvals.ts`).
- Full audit trail for tool calls, approvals, auth events and blocked commands.

### Added — AI provider layer
- OpenAI-compatible streaming provider (works with OpenAI, vLLM, LM Studio, OpenRouter, …).
- Ollama provider with NDJSON streaming and native tool calling.
- Offline demo agent: plans and executes real tools with no API key, so the product is
  fully usable (and testable in CI) without credentials.
- Provider resolution and model catalogue exposed through `GET /api/models`
  (`provider`, `demoMode`, `providers`).

### Added — operations
- `GET /api/health` — store, sandbox and AI readiness.
- `GET /api/version` — version, milestones and enabled features.
- Durable JSON store (`lib/db/store.ts`) with atomic writes; Prisma schema retained for
  Postgres deployments.
- Production Dockerfile bundling Chromium and the sandbox toolchain, with a healthcheck.
- Settings page rendering live runtime status (health, provider, sandbox, browser, audit).

### Changed
- `scripts/prepare-chromium.mjs` extracts a real Chromium from `@sparticuz/chromium`,
  including the bundled shared libraries needed on non-Amazon-Linux hosts.
- Browser engine filters launch flags that break multi-context operation
  (`--single-process`, `--disable-web-security`, `--allow-running-insecure-content`).

### Verification
- 79 unit/integration tests (auth, policy, sandbox, tools/approvals, browser, providers).
- `scripts/e2e-production.mjs`: 18 end-to-end checks against a real `next build` +
  `next start`, driven by real headless Chromium — signup, session cookies, chat agent
  writing and running code, browser screenshots, preview proxy, approval decision,
  policy refusal (HTTP 403), audit trail.

## [2.0.0] — Browser automation + authentication

### Added — authentication
- NextAuth credentials provider with bcryptjs hashing (cost 12) and 30-day JWT sessions.
- Registration endpoint + UI with password policy and rate limiting (10/hour/IP);
  login limited to 10 attempts/minute per email+IP.
- Env-gated GitHub and Google OAuth providers.
- Route middleware protecting the dashboard; `callbackUrl` round-trip on redirect.
- Demo account (`demo@xit.dev` / `demo1234`) seeded on first boot.
- Static bearer token (`X_IT_API_TOKEN`) for machine access to the API.

### Added — browser automation
- Real headless Chromium through puppeteer-core, with automatic binary resolution.
- Session lifecycle, navigation, clicks (selector or coordinates), typing, scrolling,
  back/forward/reload, viewport control and page title/state.
- Screenshots (PNG/JPEG, full-page supported) and content extraction as
  HTML, text, markdown or links.
- SSRF guard: scheme allow-list plus private-network blocking, with an explicit
  opt-in (`X_IT_ALLOW_PRIVATE_NETWORK`) for local previews.
- Browser tool integration (`browser_navigate`, `browser_action`, `browser_screenshot`,
  `browser_extract`, `browser_close`) and a live Browser tab in the tools panel.

## [1.0.0] — Initial build

- Next.js 14 App Router application shell, chat UI with streaming responses,
  conversation persistence, tool-definition catalogue and approvals UI.
