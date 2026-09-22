import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  prisma ??= new PrismaClient({
    adapter: new PrismaPg(env.DATABASE_URL)
  });

  return prisma;
}

export async function checkPrismaConnection(): Promise<void> {
  await getPrismaClient().$queryRaw`select 1 as healthy`;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
