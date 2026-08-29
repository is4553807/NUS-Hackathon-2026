"use server";

import { revalidatePath } from "next/cache";

import type {
  MerchantProduct,
  PricingPolicy,
  ProductVariant,
} from "@/lib/merchant-api";
import { apiBaseUrl } from "@/lib/api-client";

type Scalar = string | number | boolean;
type Attributes = Record<string, Scalar>;

type ProductDetails = { type: string } & Record<string, unknown>;

type CreateVariantMutation = {
  externalId?: string | null;
  sku?: string | null;
  name?: string | null;
  attributes: Attributes;
  listedPrice?: number;
  imageUrl?: string | null;
  active?: boolean;
  quantityAvailable: number;
};

type CreateProductMutation = {
  merchantId: string;
  externalId?: string | null;
  categoryId: string;
  billingModel?: "one_time" | "recurring" | "usage_based" | "deposit";
  availabilityModel?: "stock" | "unlimited" | "time_slot" | "capacity" | "seat";
  name: string;
  description?: string | null;
  brand?: string | null;
  basePrice: number;
  currency: "SGD";
  imageUrl?: string | null;
  attributes: Attributes;
  variants: CreateVariantMutation[];
  details: ProductDetails;
  active?: boolean;
};

type UpdateProductMutation = {
  externalId?: string | null;
  name?: string;
  description?: string | null;
  brand?: string | null;
  basePrice?: number;
  imageUrl?: string | null;
  attributes?: Attributes;
  active?: boolean;
};

type UpdateVariantMutation = {
  externalId?: string | null;
  sku?: string | null;
  name?: string | null;
  attributes?: Attributes;
  listedPrice?: number;
  imageUrl?: string | null;
  active?: boolean;
  quantityAvailable?: number;
};

type PricingMutation = {
  negotiationEnabled: boolean;
  minimumPrice?: number | null;
  maxDiscountPercent?: number | null;
  inventoryDiscountEnabled?: boolean;
};

export type MerchantActionResult<T = undefined> =
  | { success: true; data: T; message: string }
  | { success: false; message: string };

type ApiEnvelope<T> =
  { success: true; data: T } | { success: false; error: { message: string } };

async function commerceRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    throw new Error(
      envelope.success ? "Commerce request failed." : envelope.error.message,
    );
  }
  return envelope.data;
}

function success<T>(data: T, message: string): MerchantActionResult<T> {
  revalidatePath("/merchant");
  return { success: true, data, message };
}

function failure(error: unknown): MerchantActionResult<never> {
  return {
    success: false,
    message:
      error instanceof Error
        ? error.message
        : "The Commerce API could not complete this request.",
  };
}

export async function createMerchantProductAction(
  input: CreateProductMutation,
): Promise<MerchantActionResult<MerchantProduct>> {
  try {
    const { merchantId, variants, ...productInput } = input;
    const product = await commerceRequest<MerchantProduct>(
      `/v1/merchants/${encodeURIComponent(merchantId)}/products`,
      {
        method: "POST",
        body: JSON.stringify({
          ...productInput,
          variants: variants.map(
            ({ quantityAvailable: _quantity, ...variant }) => variant,
          ),
        }),
      },
    );

    await Promise.all(
      product.variants.map((variant, index) =>
        commerceRequest(
          `/v1/variants/${encodeURIComponent(variant.variantId)}/inventory`,
          {
            method: "PUT",
            body: JSON.stringify({
              quantityAvailable: variants[index]?.quantityAvailable ?? 0,
            }),
          },
        ),
      ),
    );
    return success(product, `${product.name} was added to the catalog.`);
  } catch (error) {
    return failure(error);
  }
}

export async function updateMerchantProductAction(
  productId: string,
  input: UpdateProductMutation,
): Promise<MerchantActionResult<MerchantProduct>> {
  try {
    const product = await commerceRequest<MerchantProduct>(
      `/v1/products/${encodeURIComponent(productId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
    return success(product, `${product.name} was updated.`);
  } catch (error) {
    return failure(error);
  }
}

export async function updateMerchantVariantAction(
  variantId: string,
  input: UpdateVariantMutation,
): Promise<MerchantActionResult<ProductVariant>> {
  try {
    const { quantityAvailable, ...variantInput } = input;
    const variant = await commerceRequest<ProductVariant>(
      `/v1/variants/${encodeURIComponent(variantId)}`,
      { method: "PATCH", body: JSON.stringify(variantInput) },
    );
    if (quantityAvailable !== undefined) {
      await commerceRequest(
        `/v1/variants/${encodeURIComponent(variantId)}/inventory`,
        {
          method: "PUT",
          body: JSON.stringify({ quantityAvailable }),
        },
      );
    }
    return success(variant, `${variant.name ?? "Variant"} was updated.`);
  } catch (error) {
    return failure(error);
  }
}

export async function getMerchantPricingPolicyAction(
  productId: string,
): Promise<MerchantActionResult<PricingPolicy | null>> {
  try {
    const policy = await commerceRequest<PricingPolicy>(
      `/v1/products/${encodeURIComponent(productId)}/pricing-policy`,
    );
    return { success: true, data: policy, message: "Pricing policy loaded." };
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return {
        success: true,
        data: null,
        message: "No pricing policy is configured yet.",
      };
    }
    return failure(error);
  }
}

export async function configureMerchantPricingAction(
  productId: string,
  input: PricingMutation,
): Promise<MerchantActionResult<PricingPolicy>> {
  try {
    const policy = await commerceRequest<PricingPolicy>(
      `/v1/products/${encodeURIComponent(productId)}/pricing-policy`,
      { method: "PUT", body: JSON.stringify(input) },
    );
    return success(policy, "Private pricing policy was updated.");
  } catch (error) {
    return failure(error);
  }
}
