import { getPrismaClient, type PrismaClient } from "@visa-commerce/db";

export type CommerceDatabase = PrismaClient;

export type CommerceDependencies = {
  database?: CommerceDatabase;
  now?: () => Date;
  offerTtlMs?: number;
};

export function getCommerceDatabase(
  dependencies: CommerceDependencies = {},
): CommerceDatabase {
  return dependencies.database ?? getPrismaClient();
}
