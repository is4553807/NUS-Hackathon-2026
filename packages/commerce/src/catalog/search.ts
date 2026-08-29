import {
  CommerceDomain as DatabaseCommerceDomain,
  MerchantStatus,
  Prisma,
} from "@visa-commerce/db";
import {
  SearchProductsRequestSchema,
  type CommerceDomain,
  type ProductAttributeValue,
  type ProductAttributes,
  type ProductSearchResult,
  type SearchProductsData,
  type SearchProductsRequest,
  type UserIntent,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound } from "../errors.js";
import { calculateAvailableQuantity } from "../inventory/index.js";

const domainToDatabase: Record<CommerceDomain, DatabaseCommerceDomain> = {
  retail_goods: DatabaseCommerceDomain.RETAIL_GOODS,
  services_subscriptions: DatabaseCommerceDomain.SERVICES_SUBSCRIPTIONS,
  bookings: DatabaseCommerceDomain.BOOKINGS,
};

const domainFromDatabase: Record<DatabaseCommerceDomain, CommerceDomain> = {
  RETAIL_GOODS: "retail_goods",
  SERVICES_SUBSCRIPTIONS: "services_subscriptions",
  BOOKINGS: "bookings",
};

const matchingProductInclude = {
  merchant: { select: { name: true, status: true } },
  category: { select: { id: true, name: true, aliases: true, domain: true } },
  variants: {
    where: { active: true },
    include: { inventory: true },
    orderBy: [{ listedPrice: "asc" as const }, { createdAt: "asc" as const }],
  },
  pricingPolicy: true,
  physicalGoodDetails: true,
  bookingExperienceDetails: true,
} satisfies Prisma.ProductInclude;

type MatchingProduct = Prisma.ProductGetPayload<{
  include: typeof matchingProductInclude;
}>;

export type MatchedProductCandidate = {
  productId: string;
  merchantId: string;
  merchantName: string;
  productName: string;
  brand: string | null;
  commerceDomain: CommerceDomain;
  categoryId: string;
  productKind: "physical_good" | "digital_product" | "service" | "booking";
  listedPrice: number;
  currency: "SGD";
  variantId: string;
  matchedAttributes: ProductAttributes;
  quantityAvailable: number;
  physicalShippingRequired: boolean | null;
  bookingStartsAt: Date | null;
  negotiationEnabled: boolean;
  minimumPrice: number | null;
  maxDiscountPercent: number | null;
};

export type PublicProductVariant = {
  variantId: string;
  sku: string | null;
  name: string | null;
  attributes: ProductAttributes;
  listedPrice: number;
  quantityAvailable: number;
};

export type PublicProductRecord = {
  productId: string;
  merchantId: string;
  merchantName: string;
  productName: string;
  description: string | null;
  brand: string | null;
  commerceDomain: CommerceDomain;
  categoryId: string;
  categoryName: string;
  basePrice: number;
  currency: "SGD";
  imageUrl: string | null;
  attributes: ProductAttributes;
  variants: PublicProductVariant[];
};

function isScalarJsonValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function scalarAttributes(value: Prisma.JsonValue): ProductAttributes {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        isScalarJsonValue(entry[1]),
    ),
  );
}

function normalizeAttribute(value: ProductAttributeValue): string {
  return String(value).trim().toLocaleLowerCase("en");
}

export function attributesSatisfyIntent(
  available: ProductAttributes,
  requested: ProductAttributes,
): boolean {
  return Object.entries(requested).every(([key, requestedValue]) => {
    const availableValue = available[key];
    return (
      availableValue !== undefined &&
      normalizeAttribute(availableValue) === normalizeAttribute(requestedValue)
    );
  });
}

function brandMatches(
  brand: string | null,
  brandPreferences: string[],
): boolean {
  if (brandPreferences.length === 0) return true;
  if (brand === null) return false;
  const normalizedBrand = brand.trim().toLocaleLowerCase("en");
  return brandPreferences.some(
    (preference) =>
      preference.trim().toLocaleLowerCase("en") === normalizedBrand,
  );
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function queryMatches(product: MatchingProduct, query: string): boolean {
  const productAttributes = scalarAttributes(product.attributes);
  const haystack = normalizeSearchText(
    [
      product.name,
      product.description ?? "",
      product.brand ?? "",
      product.category.name,
      ...product.category.aliases,
      ...Object.values(productAttributes).map(String),
    ].join(" "),
  );
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function toCandidate(
  product: MatchingProduct,
  intent: UserIntent,
): MatchedProductCandidate | null {
  if (!queryMatches(product, intent.query)) return null;
  if (!brandMatches(product.brand, intent.brandPreferences)) return null;

  const commonAttributes = scalarAttributes(product.attributes);
  const matchingVariant = product.variants.find((variant) =>
    attributesSatisfyIntent(
      { ...commonAttributes, ...scalarAttributes(variant.attributes) },
      intent.productAttributes,
    ),
  );
  if (matchingVariant === undefined || matchingVariant.inventory === null) {
    return null;
  }

  const pricingPolicy = product.pricingPolicy;
  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    productName: product.name,
    brand: product.brand,
    commerceDomain: domainFromDatabase[product.category.domain],
    categoryId: product.categoryId,
    productKind:
      product.productKind.toLowerCase() as MatchedProductCandidate["productKind"],
    listedPrice: matchingVariant.listedPrice.toNumber(),
    currency: "SGD",
    variantId: matchingVariant.id,
    matchedAttributes: {
      ...commonAttributes,
      ...scalarAttributes(matchingVariant.attributes),
    },
    quantityAvailable: calculateAvailableQuantity(
      matchingVariant.inventory.quantityAvailable,
      matchingVariant.inventory.quantityReserved,
    ),
    physicalShippingRequired:
      product.physicalGoodDetails?.shippingRequired ?? null,
    bookingStartsAt: product.bookingExperienceDetails?.startsAt ?? null,
    negotiationEnabled: pricingPolicy?.negotiationEnabled ?? false,
    minimumPrice: pricingPolicy?.minimumPrice?.toNumber() ?? null,
    maxDiscountPercent: pricingPolicy?.maxDiscountPercent?.toNumber() ?? null,
  };
}

export async function findMatchingProductCandidates(
  intent: UserIntent,
  dependencies: CommerceDependencies = {},
): Promise<MatchedProductCandidate[]> {
  const database = getCommerceDatabase(dependencies);
  const products = await database.product.findMany({
    where: {
      active: true,
      currency: intent.currency,
      category: {
        active: true,
        domain: domainToDatabase[intent.commerceDomain],
      },
      ...(intent.categoryId === null
        ? {}
        : {
            OR: [
              { categoryId: intent.categoryId },
              { categoryId: { startsWith: `${intent.categoryId}.` } },
            ],
          }),
      merchant: { status: MerchantStatus.ACTIVE },
    },
    include: matchingProductInclude,
    orderBy: [{ basePrice: "asc" }, { createdAt: "asc" }],
  });

  return products
    .map((product) => toCandidate(product, intent))
    .filter(
      (candidate): candidate is MatchedProductCandidate => candidate !== null,
    );
}

export async function searchProducts(
  request: SearchProductsRequest,
  dependencies: CommerceDependencies = {},
): Promise<SearchProductsData> {
  const { intent } = SearchProductsRequestSchema.parse(request);
  const candidates = await findMatchingProductCandidates(intent, dependencies);
  const products: ProductSearchResult[] = candidates.map((candidate) => ({
    productId: candidate.productId,
    merchantId: candidate.merchantId,
    merchantName: candidate.merchantName,
    productName: candidate.productName,
    brand: candidate.brand,
    commerceDomain: candidate.commerceDomain,
    categoryId: candidate.categoryId,
    variantId: candidate.variantId,
    listedPrice: candidate.listedPrice,
    currency: candidate.currency,
    matchedAttributes: candidate.matchedAttributes,
  }));
  return { products };
}

export async function getPublicProduct(
  productId: string,
  dependencies: CommerceDependencies = {},
): Promise<PublicProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const product = await database.product.findFirst({
    where: {
      id: productId,
      active: true,
      merchant: { status: MerchantStatus.ACTIVE },
    },
    include: matchingProductInclude,
  });
  if (product === null) throwNotFound("Product", productId);

  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    productName: product.name,
    description: product.description,
    brand: product.brand,
    commerceDomain: domainFromDatabase[product.category.domain],
    categoryId: product.categoryId,
    categoryName: product.category.name,
    basePrice: product.basePrice.toNumber(),
    currency: "SGD",
    imageUrl: product.imageUrl,
    attributes: scalarAttributes(product.attributes),
    variants: product.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      attributes: scalarAttributes(variant.attributes),
      listedPrice: variant.listedPrice.toNumber(),
      quantityAvailable:
        variant.inventory === null
          ? 0
          : calculateAvailableQuantity(
              variant.inventory.quantityAvailable,
              variant.inventory.quantityReserved,
            ),
    })),
  };
}
