import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { sandboxId: string } }
) {
  try {
    const { sandboxId } = params;
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    // Mock file content based on path
    const mockContent = `// Contents of ${path}
// This would be read from the sandbox container in production.

export default function App() {
  return (
    <div>
      <h1>Hello from ${sandboxId}</h1>
    </div>
  );
}`;

    return NextResponse.json({ content: mockContent, path, sandboxId });
  } catch (error) {
    console.error("File read error:", error);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}