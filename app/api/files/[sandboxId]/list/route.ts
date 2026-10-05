import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { sandboxId: string } }
) {
  try {
    const { sandboxId } = params;
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path") || "/home/sandbox/project";

    // Mock file tree for demonstration
    const mockFiles = [
      { name: "src", path: `${path}/src`, type: "directory", size: 0 },
      { name: "public", path: `${path}/public`, type: "directory", size: 0 },
      { name: "node_modules", path: `${path}/node_modules`, type: "directory", size: 0 },
      { name: "package.json", path: `${path}/package.json`, type: "file", size: 1234 },
      { name: "README.md", path: `${path}/README.md`, type: "file", size: 567 },
      { name: "tsconfig.json", path: `${path}/tsconfig.json`, type: "file", size: 890 },
      { name: ".gitignore", path: `${path}/.gitignore`, type: "file", size: 234 },
    ];

    return NextResponse.json({ files: mockFiles, path, sandboxId });
  } catch (error) {
    console.error("File list error:", error);
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }
}