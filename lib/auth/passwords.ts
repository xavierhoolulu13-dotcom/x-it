import { compare, hash } from "bcryptjs";

export const BCRYPT_ROUNDS = 12;

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordPolicyResult {
  ok: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-zA-Z]/.test(password)) errors.push("Password must contain a letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  if (password.length > 200) errors.push("Password must be 200 characters or fewer");
  return { ok: errors.length === 0, errors };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await compare(password, hashed);
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
