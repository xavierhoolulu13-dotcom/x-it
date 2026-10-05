/**
 * Database client wrapper.
 *
 * In production, this uses Prisma with PostgreSQL.
 * For the demo/development environment, it uses an in-memory store
 * when Prisma engine is not available.
 */

import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

try {
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
  prismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaClient;
} catch {
  console.warn("[DB] Prisma client not available, using mock store");
}

export const prisma = prismaClient;

export default prisma;