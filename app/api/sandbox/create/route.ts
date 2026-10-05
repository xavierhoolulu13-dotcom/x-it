import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, cpuLimit, memoryLimit } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // In production, this would use the SandboxManager to create a real Docker container
    // For now, return a mock sandbox
    const sandbox = {
      id: `sandbox-${projectId}-${Date.now()}`,
      projectId,
      containerId: `mock-container-${Date.now()}`,
      status: "running",
      cpuLimit: cpuLimit || 2,
      memoryLimit: memoryLimit || 2048,
      diskLimit: 10240,
      port: 8080 + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(sandbox);
  } catch (error) {
    console.error("Sandbox create error:", error);
    return NextResponse.json(
      { error: "Failed to create sandbox" },
      { status: 500 }
    );
  }
}