import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function hasExpectedDelegates(client: PrismaClient): boolean {
  return "user" in client && "modelPreference" in client;
}

const cachedPrisma = globalForPrisma.prisma;

export const prisma =
  cachedPrisma && hasExpectedDelegates(cachedPrisma)
    ? cachedPrisma
    : createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
