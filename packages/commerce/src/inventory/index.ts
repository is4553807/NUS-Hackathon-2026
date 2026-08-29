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
  requireNonNegativeInteger,
  requirePositiveInteger,
} from "../validation.js";

export type InventoryAvailability = "in_stock" | "low_stock" | "out_of_stock";

export type UpsertInventoryInput = {
  variantId: string;
  quantityAvailable: number;
  quantityReserved?: number;
};

export type InventoryRecord = {
  inventoryId: string;
  merchantId: string;
  productId: string;
  variantId: string;
  sku: string | null;
  attributes: ProductAttributes;
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

function normalizedAttribute(value: ProductAttributeValue): string {
  return String(value).trim().toLocaleLowerCase("en");
}

export function variantMatchesAttributes(
  variantAttributes: ProductAttributes,
  requestedAttributes: ProductAttributes,
): boolean {
  return Object.entries(requestedAttributes).every(([key, requestedValue]) => {
    const variantValue = variantAttributes[key];
    return (
      variantValue !== undefined &&
      normalizedAttribute(requestedValue) === normalizedAttribute(variantValue)
    );
  });
}

function scalarAttributes(value: Prisma.JsonValue): ProductAttributes {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  );
}

type InventoryWithVariant = Prisma.InventoryGetPayload<{
  include: {
    variant: { select: { productId: true; sku: true; attributes: true } };
  };
}>;

function toInventoryRecord(inventory: InventoryWithVariant): InventoryRecord {
  return {
    inventoryId: inventory.id,
    merchantId: inventory.merchantId,
    productId: inventory.variant.productId,
    variantId: inventory.variantId,
    sku: inventory.variant.sku,
    attributes: scalarAttributes(inventory.variant.attributes),
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

const inventoryInclude = {
  variant: { select: { productId: true, sku: true, attributes: true } },
} as const;

export async function upsertInventory(
  input: UpsertInventoryInput,
  dependencies: CommerceDependencies = {},
): Promise<InventoryRecord> {
  const database = getCommerceDatabase(dependencies);
  const variant = await database.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true, merchantId: true },
  });
  if (variant === null) throwNotFound("ProductVariant", input.variantId);

  const existing = await database.inventory.findUnique({
    where: { variantId: input.variantId },
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

  const data = {
    merchantId: variant.merchantId,
    quantityAvailable,
    quantityReserved,
    availability: deriveInventoryAvailability(
      quantityAvailable,
      quantityReserved,
    ),
  } satisfies Omit<Prisma.InventoryUncheckedCreateInput, "id" | "variantId">;

  const inventory = await database.inventory.upsert({
    where: { variantId: input.variantId },
    create: { variantId: input.variantId, ...data },
    update: data,
    include: inventoryInclude,
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
  if (product === null) throwNotFound("Product", productId);

  const inventory = await database.inventory.findMany({
    where: { variant: { productId } },
    include: inventoryInclude,
    orderBy: { variant: { createdAt: "asc" } },
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
    include: {
      variants: {
        where: { active: true },
        include: { inventory: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (product === null) throwNotFound("Product", input.productId);

  const variant = product.variants.find((candidate) =>
    variantMatchesAttributes(
      scalarAttributes(candidate.attributes),
      input.attributes,
    ),
  );
  if (variant === undefined || variant.inventory === null) {
    return {
      available: false,
      quantityAvailable: 0,
      variantId: variant?.id ?? null,
      checkedAt: new Date().toISOString(),
    };
  }

  const availableQuantity = calculateAvailableQuantity(
    variant.inventory.quantityAvailable,
    variant.inventory.quantityReserved,
  );
  return {
    available: availableQuantity >= quantity,
    quantityAvailable: availableQuantity,
    variantId: variant.id,
    checkedAt: new Date().toISOString(),
  };
}
