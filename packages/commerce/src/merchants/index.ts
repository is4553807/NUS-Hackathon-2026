import {
  MerchantStatus as DatabaseMerchantStatus,
  type Prisma,
} from "@visa-commerce/db";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound } from "../errors.js";
import { requireNonEmpty } from "../validation.js";

export type MerchantStatus = "active" | "inactive" | "suspended";

export type CreateMerchantInput = {
  name: string;
  category?: string | null;
  description?: string | null;
  currency?: "SGD";
  contactEmail?: string | null;
};

export type MerchantRecord = {
  merchantId: string;
  name: string;
  category: string | null;
  description: string | null;
  currency: "SGD";
  contactEmail: string | null;
  status: MerchantStatus;
  createdAt: string;
  updatedAt: string;
};

const merchantStatusMap: Record<DatabaseMerchantStatus, MerchantStatus> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
};

function toMerchantRecord(merchant: {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  currency: string;
  contactEmail: string | null;
  status: DatabaseMerchantStatus;
  createdAt: Date;
  updatedAt: Date;
}): MerchantRecord {
  return {
    merchantId: merchant.id,
    name: merchant.name,
    category: merchant.category,
    description: merchant.description,
    currency: "SGD",
    contactEmail: merchant.contactEmail,
    status: merchantStatusMap[merchant.status],
    createdAt: merchant.createdAt.toISOString(),
    updatedAt: merchant.updatedAt.toISOString(),
  };
}

export async function createMerchant(
  input: CreateMerchantInput,
  dependencies: CommerceDependencies = {},
): Promise<MerchantRecord> {
  const database = getCommerceDatabase(dependencies);
  const data: Prisma.MerchantCreateInput = {
    name: requireNonEmpty(input.name, "name"),
    category: input.category ?? null,
    description: input.description?.trim() || null,
    currency: input.currency ?? "SGD",
    contactEmail: input.contactEmail?.trim() || null,
    status: DatabaseMerchantStatus.ACTIVE,
  };

  const merchant = await database.merchant.create({ data });
  return toMerchantRecord(merchant);
}

export async function listMerchants(
  dependencies: CommerceDependencies = {},
): Promise<MerchantRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const merchants = await database.merchant.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });

  return merchants.map(toMerchantRecord);
}

export async function getMerchant(
  merchantId: string,
  dependencies: CommerceDependencies = {},
): Promise<MerchantRecord> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: merchantId },
  });

  if (merchant === null) {
    throwNotFound("Merchant", merchantId);
  }

  return toMerchantRecord(merchant);
}
