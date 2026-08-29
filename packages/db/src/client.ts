import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

type PrismaGlobal = typeof globalThis & {
  __visaCommercePrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function getPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required to create the Prisma client.");
  }

  if (prismaGlobal.__visaCommercePrisma === undefined) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prismaGlobal.__visaCommercePrisma = new PrismaClient({ adapter });
  }

  return prismaGlobal.__visaCommercePrisma;
}
