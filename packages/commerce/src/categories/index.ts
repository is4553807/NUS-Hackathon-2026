import {
  CommerceDomain as DatabaseCommerceDomain,
  MerchantStatus,
  ProductKind as DatabaseProductKind,
  type Prisma,
} from "@visa-commerce/db";
import type { CommerceDomain } from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound } from "../errors.js";
import type { JsonObject, ProductKind } from "../catalog/index.js";

export type CategoryRecord = {
  categoryId: string;
  parentId: string | null;
  commerceDomain: CommerceDomain;
  productKind: ProductKind;
  slug: string;
  name: string;
  level: number;
  aliases: string[];
  active: boolean;
};

export type CategorySchemaRecord = CategoryRecord & {
  schemaVersion: string;
  attributeSchema: JsonObject;
};

const domainMap: Record<DatabaseCommerceDomain, CommerceDomain> = {
  RETAIL_GOODS: "retail_goods",
  SERVICES_SUBSCRIPTIONS: "services_subscriptions",
  BOOKINGS: "bookings",
};

const kindMap: Record<DatabaseProductKind, ProductKind> = {
  PHYSICAL_GOOD: "physical_good",
  DIGITAL_PRODUCT: "digital_product",
  SERVICE: "service",
  BOOKING: "booking",
};

function toCategoryRecord(category: {
  id: string;
  parentId: string | null;
  domain: DatabaseCommerceDomain;
  productKind: DatabaseProductKind;
  slug: string;
  name: string;
  level: number;
  aliases: string[];
  active: boolean;
}): CategoryRecord {
  return {
    categoryId: category.id,
    parentId: category.parentId,
    commerceDomain: domainMap[category.domain],
    productKind: kindMap[category.productKind],
    slug: category.slug,
    name: category.name,
    level: category.level,
    aliases: category.aliases,
    active: category.active,
  };
}

export async function listCategories(
  dependencies: CommerceDependencies = {},
): Promise<CategoryRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const categories = await database.category.findMany({
    where: { active: true },
    orderBy: [{ domain: "asc" }, { id: "asc" }],
  });
  return categories.map(toCategoryRecord);
}

/**
 * Returns only categories that currently contain at least one active product
 * from an active Merchant. The consumer Agent uses this live list instead of
 * maintaining its own category enum, while the Merchant onboarding UI keeps
 * using listCategories() so empty categories remain available for onboarding.
 */
export async function listPopulatedCategories(
  dependencies: CommerceDependencies = {},
): Promise<CategoryRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const categories = await database.category.findMany({
    where: {
      active: true,
      products: {
        some: {
          active: true,
          merchant: { status: MerchantStatus.ACTIVE },
        },
      },
    },
    orderBy: [{ domain: "asc" }, { id: "asc" }],
  });
  return categories.map(toCategoryRecord);
}

export async function getCategorySchema(
  categoryId: string,
  dependencies: CommerceDependencies = {},
): Promise<CategorySchemaRecord> {
  const database = getCommerceDatabase(dependencies);
  const category = await database.category.findFirst({
    where: { id: categoryId, active: true },
    include: {
      schemas: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (category === null || category.schemas[0] === undefined) {
    throwNotFound("Category schema", categoryId);
  }

  return {
    ...toCategoryRecord(category),
    schemaVersion: category.schemas[0].version,
    attributeSchema: category.schemas[0]
      .attributeSchema as Prisma.JsonObject as JsonObject,
  };
}
