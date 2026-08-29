import {
  InventoryAvailability as DatabaseInventoryAvailability,
  type Prisma,
} from "@visa-commerce/db";
import type {
  CheckInventoryData,
  CheckInventoryRequest,
  ProductAttributeValue,
  ProductAttributes,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import {
  requireNonEmpty,
  requireNonNegativeInteger,
  requirePositiveInteger,
} from "../validation.js";

export type InventoryAvailability = "in_stock" | "low_stock" | "out_of_stock";

export type UpsertInventoryInput = {
  productId: string;
  variantKey: string;
  quantityAvailable: number;
  quantityReserved?: number;
};

export type InventoryRecord = {
  inventoryId: string;
  merchantId: string;
  productId: string;
  variantKey: string;
  quantityAvailable: number;
  quantityReserved: number;
  quantityRemaining: number;
  availability: InventoryAvailability;
  updatedAt: string;
};

const availabilityFromDatabase: Record<
  DatabaseInventoryAvailability,
  InventoryAvailability
> = {
  IN_STOCK: "in_stock",
  LOW_STOCK: "low_stock",
  OUT_OF_STOCK: "out_of_stock",
};

export function calculateAvailableQuantity(
  quantityAvailable: number,
  quantityReserved: number,
): number {
  return Math.max(0, quantityAvailable - quantityReserved);
}

export function deriveInventoryAvailability(
  quantityAvailable: number,
  quantityReserved: number,
): DatabaseInventoryAvailability {
  const remaining = calculateAvailableQuantity(
    quantityAvailable,
    quantityReserved,
  );

  if (remaining === 0) return DatabaseInventoryAvailability.OUT_OF_STOCK;
  if (remaining <= 5) return DatabaseInventoryAvailability.LOW_STOCK;
  return DatabaseInventoryAvailability.IN_STOCK;
}

export function parseVariantKey(variantKey: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const segment of variantKey.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (key.length > 0 && value.length > 0) parsed[key] = value;
  }

  return parsed;
}

function normalizedAttribute(value: ProductAttributeValue): string {
  return String(value).trim().toLocaleLowerCase("en");
}

export function variantMatchesAttributes(
  variantKey: string,
  attributes: ProductAttributes,
): boolean {
  const variantAttributes = Object.entries(parseVariantKey(variantKey));

  if (variantAttributes.length === 0) return false;

  return variantAttributes.every(([key, value]) => {
    const requestedValue = attributes[key];
    return (
      requestedValue !== undefined &&
      normalizedAttribute(requestedValue) === normalizedAttribute(value)
    );
  });
}

function toInventoryRecord(inventory: {
  id: string;
  merchantId: string;
  productId: string;
  variantKey: string;
  quantityAvailable: number;
  quantityReserved: number;
  availability: DatabaseInventoryAvailability;
  updatedAt: Date;
}): InventoryRecord {
  return {
    inventoryId: inventory.id,
    merchantId: inventory.merchantId,
    productId: inventory.productId,
    variantKey: inventory.variantKey,
    quantityAvailable: inventory.quantityAvailable,
    quantityReserved: inventory.quantityReserved,
    quantityRemaining: calculateAvailableQuantity(
      inventory.quantityAvailable,
      inventory.quantityReserved,
    ),
    availability: availabilityFromDatabase[inventory.availability],
    updatedAt: inventory.updatedAt.toISOString(),
  };
}

export async function upsertInventory(
  input: UpsertInventoryInput,
  dependencies: CommerceDependencies = {},
): Promise<InventoryRecord> {
  const database = getCommerceDatabase(dependencies);
  const product = await database.product.findUnique({
    where: { id: input.productId },
    select: { merchantId: true },
  });

  if (product === null) {
    throwNotFound("Product", input.productId);
  }

  const variantKey = requireNonEmpty(input.variantKey, "variantKey");
  const existing = await database.inventory.findUnique({
    where: {
      productId_variantKey: { productId: input.productId, variantKey },
    },
    select: { quantityReserved: true },
  });
  const quantityAvailable = requireNonNegativeInteger(
    input.quantityAvailable,
    "quantityAvailable",
  );
  const quantityReserved = requireNonNegativeInteger(
    input.quantityReserved ?? existing?.quantityReserved ?? 0,
    "quantityReserved",
  );

  if (quantityReserved > quantityAvailable) {
    throwValidationError(
      "quantityReserved must not exceed quantityAvailable.",
      { quantityAvailable, quantityReserved },
    );
  }

  const availability = deriveInventoryAvailability(
    quantityAvailable,
    quantityReserved,
  );
  const data = {
    merchantId: product.merchantId,
    quantityAvailable,
    quantityReserved,
    availability,
  } satisfies Omit<
    Prisma.InventoryUncheckedCreateInput,
    "id" | "productId" | "variantKey"
  >;

  const inventory = await database.inventory.upsert({
    where: {
      productId_variantKey: { productId: input.productId, variantKey },
    },
    create: {
      productId: input.productId,
      variantKey,
      ...data,
    },
    update: data,
  });

  return toInventoryRecord(inventory);
}

export async function listProductInventory(
  productId: string,
  dependencies: CommerceDependencies = {},
): Promise<InventoryRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const product = await database.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (product === null) {
    throwNotFound("Product", productId);
  }

  const inventory = await database.inventory.findMany({
    where: { productId },
    orderBy: { variantKey: "asc" },
  });

  return inventory.map(toInventoryRecord);
}

export async function checkInventory(
  input: CheckInventoryRequest,
  dependencies: CommerceDependencies = {},
): Promise<CheckInventoryData> {
  const database = getCommerceDatabase(dependencies);
  const quantity = requirePositiveInteger(input.quantity, "quantity");
  const product = await database.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });

  if (product === null) {
    throwNotFound("Product", input.productId);
  }

  const variants = await database.inventory.findMany({
    where: { productId: input.productId },
    orderBy: { variantKey: "asc" },
  });
  const variant = variants.find((candidate) =>
    variantMatchesAttributes(candidate.variantKey, input.attributes),
  );

  if (variant === undefined) {
    return {
      available: false,
      quantityAvailable: 0,
      variantKey: "unmatched",
      checkedAt: new Date().toISOString(),
    };
  }

  const availableQuantity = calculateAvailableQuantity(
    variant.quantityAvailable,
    variant.quantityReserved,
  );

  return {
    available: availableQuantity >= quantity,
    quantityAvailable: availableQuantity,
    variantKey: variant.variantKey,
    checkedAt: new Date().toISOString(),
  };
}
