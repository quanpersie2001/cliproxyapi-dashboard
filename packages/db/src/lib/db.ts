import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type UsageQueueInbox,
} from "@/generated/prisma/client";
import { UsageQueueInboxStatus } from "@/generated/prisma/enums";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const cachedPrisma = globalForPrisma.prisma;

export const prisma = cachedPrisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { Prisma, PrismaClient, UsageQueueInboxStatus };
export type { UsageQueueInbox };
