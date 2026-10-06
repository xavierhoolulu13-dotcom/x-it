import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/passwords";
import { rateLimit, resetRateLimits } from "@/lib/util/rate-limit";
import { store, newId } from "@/lib/db/store";

describe("password policy", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Prod-E2E-1234").ok).toBe(true);
  });

  it("rejects short, letter-only and digit-only passwords", () => {
    expect(validatePassword("short1").ok).toBe(false);
    expect(validatePassword("onlyletters").ok).toBe(false);
    expect(validatePassword("12345678").ok).toBe(false);
  });

  it("hashes and verifies passwords with bcrypt", async () => {
    const hash = await hashPassword("correct horse battery 9");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("correct horse battery 9", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("never verifies against an empty hash", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("email handling", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  Demo@XIT.dev ")).toBe("demo@xit.dev");
  });

  it("validates addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit then blocks with a retry hint", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("test-key", 3, 60).allowed).toBe(true);
    }
    const blocked = rateLimit("test-key", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key", () => {
    resetRateLimits();
    expect(rateLimit("a", 1, 60).allowed).toBe(true);
    expect(rateLimit("a", 1, 60).allowed).toBe(false);
    expect(rateLimit("b", 1, 60).allowed).toBe(true);
  });
});

describe("user store", () => {
  it("creates, finds and updates users", async () => {
    const email = `user-${newId("t")}@example.com`;
    const created = store.createUser({
      email,
      name: "Test User",
      hashedPassword: await hashPassword("Password123"),
    });

    expect(store.getUserById(created.id)?.email).toBe(email.toLowerCase());
    expect(store.getUserByEmail(email.toUpperCase())?.id).toBe(created.id);

    store.updateUser(created.id, { name: "Renamed" });
    expect(store.getUserById(created.id)?.name).toBe("Renamed");
  });

  it("ships a demo account with a valid bcrypt hash", async () => {
    const demo = store.getUserByEmail(process.env.DEMO_EMAIL || "demo@xit.dev");
    expect(demo).toBeTruthy();
    expect(await verifyPassword(process.env.DEMO_PASSWORD || "demo1234", demo!.hashedPassword!)).toBe(true);
  });

  it("persists to disk and reloads", async () => {
    const email = `persist-${newId("t")}@example.com`;
    store.createUser({ email, name: "Persisted" });
    store.persist();
    const raw = store.snapshot();
    expect(raw.users.some((u) => u.email === email)).toBe(true);
  });
});
