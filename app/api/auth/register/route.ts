import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, isValidEmail, normalizeEmail, validatePassword } from "@/lib/auth/passwords";
import { store } from "@/lib/db/store";
import { rateLimit } from "@/lib/util/rate-limit";
import { clientIp } from "@/lib/auth/session";

const registerSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = rateLimit(`register:${ip}`, 10, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const policy = validatePassword(parsed.data.password);
  if (!policy.ok) {
    return NextResponse.json({ error: policy.errors.join(". ") }, { status: 400 });
  }

  if (store.getUserByEmail(email)) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const user = store.createUser({
    email,
    name: parsed.data.name?.trim() || email.split("@")[0],
    hashedPassword: await hashPassword(parsed.data.password),
    provider: "credentials",
  });

  // Give every new account a starter project so the workspace is never empty.
  const project = store.createProject({
    name: "My First Project",
    description: "Scratch space for files, commands, and browser sessions",
    userId: user.id,
    systemPrompt: "",
  });

  store.addAuditLog({
    userId: user.id,
    action: "auth.register",
    resource: "user",
    resourceId: user.id,
    details: { email },
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") || undefined,
  });

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      project: { id: project.id, name: project.name },
    },
    { status: 201 }
  );
}

export async function GET() {
  return NextResponse.json({
    registrationOpen: true,
    passwordPolicy: "Minimum 8 characters, including at least one letter and one number.",
  });
}
