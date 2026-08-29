import { Prisma } from "@visa-commerce/db";

import type { JsonObject } from "../catalog/index.js";
import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import {
  requireNonNegative,
  requirePercentage,
  roundMoney,
} from "../validation.js";

export type ConfigurePricingPolicyInput = {
  productId: string;
  negotiationEnabled: boolean;
  minimumPrice?: number | null;
  maxDiscountPercent?: number | null;
  inventoryDiscountEnabled?: boolean;
  rules?: JsonObject;
};

export type PricingPolicyRecord = {
  pricingPolicyId: string;
  merchantId: string;
  productId: string;
  negotiationEnabled: boolean;
  minimumPrice: number | null;
  maxDiscountPercent: number | null;
  inventoryDiscountEnabled: boolean;
  rules: JsonObject | null;
  createdAt: string;
  updatedAt: string;
};

function toPricingPolicyRecord(policy: {
  id: string;
  merchantId: string;
  productId: string;
  negotiationEnabled: boolean;
  minimumPrice: Prisma.Decimal | null;
  maxDiscountPercent: Prisma.Decimal | null;
  inventoryDiscountEnabled: boolean;
  rules: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): PricingPolicyRecord {
  return {
    pricingPolicyId: policy.id,
    merchantId: policy.merchantId,
    productId: policy.productId,
    negotiationEnabled: policy.negotiationEnabled,
    minimumPrice: policy.minimumPrice?.toNumber() ?? null,
    maxDiscountPercent: policy.maxDiscountPercent?.toNumber() ?? null,
    inventoryDiscountEnabled: policy.inventoryDiscountEnabled,
    rules: (policy.rules as JsonObject | null) ?? null,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export async function configurePricingPolicy(
  input: ConfigurePricingPolicyInput,
  dependencies: CommerceDependencies = {},
): Promise<PricingPolicyRecord> {
  const database = getCommerceDatabase(dependencies);
  const product = await database.product.findUnique({
    where: { id: input.productId },
    select: { merchantId: true, listedPrice: true },
  });

  if (product === null) {
    throwNotFound("Product", input.productId);
  }

  let minimumPrice: number | null = null;
  let maxDiscountPercent: number | null = null;
  let inventoryDiscountEnabled = false;

  if (input.negotiationEnabled) {
    if (input.minimumPrice === null || input.minimumPrice === undefined) {
      throwValidationError(
        "minimumPrice is required when negotiation is enabled.",
        { productId: input.productId },
      );
    }

    minimumPrice = roundMoney(
      requireNonNegative(input.minimumPrice, "minimumPrice"),
    );
    maxDiscountPercent =
      input.maxDiscountPercent === null ||
      input.maxDiscountPercent === undefined
        ? null
        : requirePercentage(input.maxDiscountPercent, "maxDiscountPercent");
    inventoryDiscountEnabled = input.inventoryDiscountEnabled ?? false;

    if (minimumPrice > product.listedPrice.toNumber()) {
      throwValidationError("minimumPrice must not exceed listedPrice.", {
        minimumPrice,
        listedPrice: product.listedPrice.toNumber(),
      });
    }
  }

  const rules = input.rules as Prisma.InputJsonObject | undefined;
  const policy = await database.pricingPolicy.upsert({
    where: { productId: input.productId },
    create: {
      merchantId: product.merchantId,
      productId: input.productId,
      negotiationEnabled: input.negotiationEnabled,
      minimumPrice,
      maxDiscountPercent,
      inventoryDiscountEnabled,
      rules,
    },
    update: {
      merchantId: product.merchantId,
      negotiationEnabled: input.negotiationEnabled,
      minimumPrice,
      maxDiscountPercent,
      inventoryDiscountEnabled,
      ...(rules === undefined ? {} : { rules }),
    },
  });

  return toPricingPolicyRecord(policy);
}

export async function getPricingPolicy(
  productId: string,
  dependencies: CommerceDependencies = {},
): Promise<PricingPolicyRecord> {
  const database = getCommerceDatabase(dependencies);
  const policy = await database.pricingPolicy.findUnique({
    where: { productId },
  });

  if (policy === null) {
    throwNotFound("Pricing policy", productId);
  }

  return toPricingPolicyRecord(policy);
}
