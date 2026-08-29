import {
  MerchantStatus,
  Prisma,
  ProductCategory as DatabaseProductCategory,
} from "@visa-commerce/db";
import {
  SearchProductsRequestSchema,
  type ProductAttributeValue,
  type ProductAttributes,
  type ProductCategory,
  type ProductSearchResult,
  type SearchProductsData,
  type SearchProductsRequest,
  type UserIntent,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound } from "../errors.js";
import {
  calculateAvailableQuantity,
  parseVariantKey,
} from "../inventory/index.js";

const categoryToDatabase: Record<ProductCategory, DatabaseProductCategory> = {
  physical_goods: DatabaseProductCategory.PHYSICAL_GOODS,
  digital_products: DatabaseProductCategory.DIGITAL_PRODUCTS,
  services: DatabaseProductCategory.SERVICES,
  bookings_experiences: DatabaseProductCategory.BOOKINGS_EXPERIENCES,
};

const categoryFromDatabase: Record<DatabaseProductCategory, ProductCategory> = {
  PHYSICAL_GOODS: "physical_goods",
  DIGITAL_PRODUCTS: "digital_products",
  SERVICES: "services",
  BOOKINGS_EXPERIENCES: "bookings_experiences",
};

const matchingProductInclude = {
  merchant: { select: { name: true, status: true } },
  inventory: { orderBy: { variantKey: "asc" as const } },
  pricingPolicy: true,
  physicalGoodDetails: true,
  digitalProductDetails: true,
  serviceDetails: true,
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
  category: ProductCategory;
  listedPrice: number;
  currency: "SGD";
  variantKey: string;
  matchedAttributes: ProductAttributes;
  quantityAvailable: number;
  physicalShippingRequired: boolean | null;
  bookingStartsAt: Date | null;
  negotiationEnabled: boolean;
  minimumPrice: number | null;
  maxDiscountPercent: number | null;
};

export type PublicProductVariant = {
  variantKey: string;
  attributes: ProductAttributes;
  quantityAvailable: number;
};

export type PublicProductRecord = {
  productId: string;
  merchantId: string;
  merchantName: string;
  productName: string;
  description: string | null;
  brand: string | null;
  category: ProductCategory;
  listedPrice: number;
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

function scalarMetadata(metadata: Prisma.JsonValue | null): ProductAttributes {
  if (
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== "object"
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string | number | boolean] =>
        isScalarJsonValue(entry[1]),
    ),
  );
}

function productAttributes(product: MatchingProduct): ProductAttributes {
  if (
    product.category === DatabaseProductCategory.PHYSICAL_GOODS &&
    product.physicalGoodDetails !== null
  ) {
    const details = product.physicalGoodDetails;
    return {
      ...scalarMetadata(details.metadata),
      ...(details.sku === null ? {} : { sku: details.sku }),
      ...(details.material === null ? {} : { material: details.material }),
      shippingRequired: details.shippingRequired,
    };
  }

  if (
    product.category === DatabaseProductCategory.DIGITAL_PRODUCTS &&
    product.digitalProductDetails !== null
  ) {
    const details = product.digitalProductDetails;
    return {
      ...scalarMetadata(details.metadata),
      deliveryMethod: details.deliveryMethod.toLowerCase(),
      ...(details.fileFormat === null
        ? {}
        : { fileFormat: details.fileFormat }),
      ...(details.version === null ? {} : { version: details.version }),
      licenseRequired: details.licenseRequired,
      ...(details.accessDurationDays === null
        ? {}
        : { accessDurationDays: details.accessDurationDays }),
    };
  }

  if (
    product.category === DatabaseProductCategory.SERVICES &&
    product.serviceDetails !== null
  ) {
    const details = product.serviceDetails;
    return {
      ...scalarMetadata(details.metadata),
      serviceType: details.serviceType,
      deliveryMode: details.deliveryMode.toLowerCase(),
      durationMinutes: details.durationMinutes,
      ...(details.location === null ? {} : { location: details.location }),
      ...(details.providerName === null
        ? {}
        : { providerName: details.providerName }),
      bookingRequired: details.bookingRequired,
    };
  }

  if (
    product.category === DatabaseProductCategory.BOOKINGS_EXPERIENCES &&
    product.bookingExperienceDetails !== null
  ) {
    const details = product.bookingExperienceDetails;
    return {
      ...scalarMetadata(details.metadata),
      ...(details.experienceType === null
        ? {}
        : { experienceType: details.experienceType }),
      destination: details.destination,
      ...(details.venue === null ? {} : { venue: details.venue }),
      startsAt: details.startsAt.toISOString(),
      endsAt: details.endsAt.toISOString(),
      capacity: details.capacity,
      minParticipants: details.minParticipants,
    };
  }

  return {};
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

function toCandidate(
  product: MatchingProduct,
  intent: UserIntent,
): MatchedProductCandidate | null {
  if (!brandMatches(product.brand, intent.brandPreferences)) return null;

  const commonAttributes = productAttributes(product);
  const matchingVariant = product.inventory.find((inventory) =>
    attributesSatisfyIntent(
      { ...commonAttributes, ...parseVariantKey(inventory.variantKey) },
      intent.productAttributes,
    ),
  );

  if (matchingVariant === undefined) return null;

  const pricingPolicy = product.pricingPolicy;
  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    productName: product.name,
    brand: product.brand,
    category: categoryFromDatabase[product.category],
    listedPrice: product.listedPrice.toNumber(),
    currency: "SGD",
    variantKey: matchingVariant.variantKey,
    matchedAttributes: {
      ...commonAttributes,
      ...parseVariantKey(matchingVariant.variantKey),
    },
    quantityAvailable: calculateAvailableQuantity(
      matchingVariant.quantityAvailable,
      matchingVariant.quantityReserved,
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
      category: categoryToDatabase[intent.category],
      currency: intent.currency,
      merchant: { status: MerchantStatus.ACTIVE },
    },
    include: matchingProductInclude,
    orderBy: [{ listedPrice: "asc" }, { createdAt: "asc" }],
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
    category: candidate.category,
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

  const commonAttributes = productAttributes(product);
  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    productName: product.name,
    description: product.description,
    brand: product.brand,
    category: categoryFromDatabase[product.category],
    listedPrice: product.listedPrice.toNumber(),
    currency: "SGD",
    imageUrl: product.imageUrl,
    attributes: commonAttributes,
    variants: product.inventory.map((inventory) => ({
      variantKey: inventory.variantKey,
      attributes: parseVariantKey(inventory.variantKey),
      quantityAvailable: calculateAvailableQuantity(
        inventory.quantityAvailable,
        inventory.quantityReserved,
      ),
    })),
  };
}
