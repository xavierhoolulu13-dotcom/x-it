import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";


const X_IT_VERSION = {
  version: "3.0.0",
  milestones: {
    v1: "Chat UI, sandbox manager design, tool definitions, approvals UI (initial build)",
    v2: "Browser automation (real headless Chromium) + real authentication (NextAuth credentials/OAuth, registration, rate limited)",
    v3: "Real sandbox execution, real AI provider streaming with tool loop, approvals + audit persistence, preview proxy, snapshots, tests",
  },
  features: {
    browserAutomation: true,
    auth: ["credentials", "github", "google"],
    sandboxBackends: ["docker", "local"],
    aiProviders: ["openai-compatible", "ollama", "demo-agent"],
    approvals: true,
    auditLog: true,
    snapshots: true,
    previewProxy: true,
  },
};

export async function GET() {
  return NextResponse.json(X_IT_VERSION);
}
