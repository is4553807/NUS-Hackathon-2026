import {
  AvailabilityModel as DatabaseAvailabilityModel,
  BillingModel as DatabaseBillingModel,
  CommerceDomain as DatabaseCommerceDomain,
  DigitalDeliveryMethod as DatabaseDigitalDeliveryMethod,
  Prisma,
  ProductKind as DatabaseProductKind,
  ServiceDeliveryMode as DatabaseServiceDeliveryMode,
} from "@visa-commerce/db";
import type {
  CommerceDomain,
  ProductAttributes,
} from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import { calculateAvailableQuantity } from "../inventory/index.js";
import {
  requireDate,
  requireNonEmpty,
  requireNonNegative,
  requireNonNegativeInteger,
  requirePositiveInteger,
  roundMoney,
} from "../validation.js";

export * from "./search.js";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ProductKind =
  "physical_good" | "digital_product" | "service" | "booking";
export type BillingModel = "one_time" | "recurring" | "usage_based" | "deposit";
export type AvailabilityModel =
  "stock" | "unlimited" | "time_slot" | "capacity" | "seat";

export type ProductVariantInput = {
  externalId?: string | null;
  sku?: string | null;
  name?: string | null;
  attributes: ProductAttributes;
  listedPrice?: number;
  imageUrl?: string | null;
  active?: boolean;
};

export type PhysicalGoodDetailsInput = {
  type: "physical_good";
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  shippingRequired?: boolean;
};

export type DigitalProductDetailsInput = {
  type: "digital_product";
  deliveryMethod: "download" | "license_key" | "streaming" | "account_access";
  fileFormat?: string | null;
  fileSizeBytes?: number | null;
  version?: string | null;
  licenseRequired?: boolean;
  accessDurationDays?: number | null;
  fulfillmentUrl?: string | null;
};

export type ServiceDetailsInput = {
  type: "service";
  serviceType: string;
  deliveryMode: "in_person" | "remote" | "hybrid";
  durationMinutes: number;
  location?: string | null;
  serviceAreas?: string[];
  providerName?: string | null;
  bookingRequired?: boolean;
};

export type BookingExperienceDetailsInput = {
  type: "booking";
  experienceType?: string | null;
  destination: string;
  venue?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone?: string;
  capacity: number;
  minParticipants?: number;
  meetingPoint?: string | null;
};

export type ProductDetailsInput =
  | PhysicalGoodDetailsInput
  | DigitalProductDetailsInput
  | ServiceDetailsInput
  | BookingExperienceDetailsInput;

export type CreateProductInput = {
  merchantId: string;
  externalId?: string | null;
  categoryId: string;
  billingModel?: BillingModel;
  availabilityModel?: AvailabilityModel;
  name: string;
  description?: string | null;
  brand?: string | null;
  basePrice: number;
  currency?: "SGD";
  imageUrl?: string | null;
  attributes: ProductAttributes;
  variants: ProductVariantInput[];
  details: ProductDetailsInput;
  active?: boolean;
};

export type UpdateProductInput = {
  externalId?: string | null;
  name?: string;
  description?: string | null;
  brand?: string | null;
  basePrice?: number;
  imageUrl?: string | null;
  attributes?: ProductAttributes;
  active?: boolean;
};

export type UpdateProductVariantInput = {
  externalId?: string | null;
  sku?: string | null;
  name?: string | null;
  attributes?: ProductAttributes;
  listedPrice?: number;
  imageUrl?: string | null;
  active?: boolean;
};

export type ProductVariantRecord = {
  variantId: string;
  externalId: string | null;
  sku: string | null;
  name: string | null;
  attributes: ProductAttributes;
  listedPrice: number;
  imageUrl: string | null;
  active: boolean;
  quantityAvailable: number | null;
  quantityReserved: number | null;
  quantityRemaining: number | null;
};

export type ProductRecord = {
  productId: string;
  merchantId: string;
  merchantName: string;
  externalId: string | null;
  name: string;
  description: string | null;
  commerceDomain: CommerceDomain;
  categoryId: string;
  categoryName: string;
  productKind: ProductKind;
  billingModel: BillingModel;
  availabilityModel: AvailabilityModel;
  brand: string | null;
  basePrice: number;
  currency: "SGD";
  imageUrl: string | null;
  attributes: ProductAttributes;
  active: boolean;
  details: JsonObject | null;
  variants: ProductVariantRecord[];
  createdAt: string;
  updatedAt: string;
};

type AttributeDefinition = {
  type: "string" | "number" | "boolean";
  scope: "product" | "variant";
  required: boolean;
};

const commerceDomainMap: Record<DatabaseCommerceDomain, CommerceDomain> = {
  RETAIL_GOODS: "retail_goods",
  SERVICES_SUBSCRIPTIONS: "services_subscriptions",
  BOOKINGS: "bookings",
};

const productKindMap: Record<DatabaseProductKind, ProductKind> = {
  PHYSICAL_GOOD: "physical_good",
  DIGITAL_PRODUCT: "digital_product",
  SERVICE: "service",
  BOOKING: "booking",
};

const billingToDatabase: Record<BillingModel, DatabaseBillingModel> = {
  one_time: DatabaseBillingModel.ONE_TIME,
  recurring: DatabaseBillingModel.RECURRING,
  usage_based: DatabaseBillingModel.USAGE_BASED,
  deposit: DatabaseBillingModel.DEPOSIT,
};

const billingFromDatabase: Record<DatabaseBillingModel, BillingModel> = {
  ONE_TIME: "one_time",
  RECURRING: "recurring",
  USAGE_BASED: "usage_based",
  DEPOSIT: "deposit",
};

const availabilityToDatabase: Record<
  AvailabilityModel,
  DatabaseAvailabilityModel
> = {
  stock: DatabaseAvailabilityModel.STOCK,
  unlimited: DatabaseAvailabilityModel.UNLIMITED,
  time_slot: DatabaseAvailabilityModel.TIME_SLOT,
  capacity: DatabaseAvailabilityModel.CAPACITY,
  seat: DatabaseAvailabilityModel.SEAT,
};

const availabilityFromDatabase: Record<
  DatabaseAvailabilityModel,
  AvailabilityModel
> = {
  STOCK: "stock",
  UNLIMITED: "unlimited",
  TIME_SLOT: "time_slot",
  CAPACITY: "capacity",
  SEAT: "seat",
};

const digitalDeliveryToDatabase = {
  download: DatabaseDigitalDeliveryMethod.DOWNLOAD,
  license_key: DatabaseDigitalDeliveryMethod.LICENSE_KEY,
  streaming: DatabaseDigitalDeliveryMethod.STREAMING,
  account_access: DatabaseDigitalDeliveryMethod.ACCOUNT_ACCESS,
} as const;

const digitalDeliveryFromDatabase = {
  DOWNLOAD: "download",
  LICENSE_KEY: "license_key",
  STREAMING: "streaming",
  ACCOUNT_ACCESS: "account_access",
} as const;

const serviceModeToDatabase = {
  in_person: DatabaseServiceDeliveryMode.IN_PERSON,
  remote: DatabaseServiceDeliveryMode.REMOTE,
  hybrid: DatabaseServiceDeliveryMode.HYBRID,
} as const;

const serviceModeFromDatabase = {
  IN_PERSON: "in_person",
  REMOTE: "remote",
  HYBRID: "hybrid",
} as const;

const productInclude = {
  merchant: { select: { name: true } },
  category: { select: { name: true, domain: true } },
  physicalGoodDetails: true,
  digitalProductDetails: true,
  serviceDetails: true,
  bookingExperienceDetails: true,
  variants: {
    include: { inventory: true },
    orderBy: [{ listedPrice: "asc" as const }, { createdAt: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;

type ProductWithDetails = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

const MAX_SKU_LENGTH = 150;

function skuWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function compactSkuCode(value: string, fallback: string): string {
  const words = skuWords(value);
  const firstWord = words[0];
  if (firstWord === undefined) return fallback;
  if (words.length === 1) return firstWord.slice(0, 12);
  return words
    .map((word) => (/^\d+$/.test(word) ? word : word.slice(0, 3)))
    .join("-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function merchantSkuCode(merchantName: string): string {
  const words = skuWords(merchantName);
  const firstWord = words[0];
  if (firstWord === undefined) return "MERCHANT";
  if (words.length === 1) return firstWord.slice(0, 8);
  return words
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 8);
}

export function buildAutomaticSku(input: {
  merchantName: string;
  productName: string;
  variantName?: string | null;
  attributes: ProductAttributes;
  position: number;
}): string {
  const attributeLabel = Object.entries(input.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => String(value))
    .join(" ");
  const variantLabel =
    optionalText(input.variantName) ??
    optionalText(attributeLabel) ??
    `OPTION ${input.position + 1}`;
  return [
    merchantSkuCode(input.merchantName),
    compactSkuCode(input.productName, "PRODUCT"),
    compactSkuCode(variantLabel, `OPTION-${input.position + 1}`),
  ]
    .join("-")
    .slice(0, 140)
    .replace(/-+$/g, "");
}

export function nextAvailableSku(
  preferredSku: string,
  usedSkus: ReadonlySet<string>,
): string {
  const base = preferredSku.slice(0, MAX_SKU_LENGTH).replace(/-+$/g, "");
  if (!usedSkus.has(base)) return base;

  for (let copy = 2; ; copy += 1) {
    const suffix = `-${copy}`;
    const candidate = `${base
      .slice(0, MAX_SKU_LENGTH - suffix.length)
      .replace(/-+$/g, "")}${suffix}`;
    if (!usedSkus.has(candidate)) return candidate;
  }
}

function cleanOptions(values: string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function scalarAttributes(value: Prisma.JsonValue): ProductAttributes {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
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

function mapDetails(product: ProductWithDetails): JsonObject | null {
  if (product.productKind === DatabaseProductKind.PHYSICAL_GOOD) {
    const details = product.physicalGoodDetails;
    if (details === null) return null;
    return {
      type: "physical_good",
      weightGrams: details.weightGrams,
      lengthCm: details.lengthCm?.toNumber() ?? null,
      widthCm: details.widthCm?.toNumber() ?? null,
      heightCm: details.heightCm?.toNumber() ?? null,
      shippingRequired: details.shippingRequired,
    };
  }

  if (product.productKind === DatabaseProductKind.DIGITAL_PRODUCT) {
    const details = product.digitalProductDetails;
    if (details === null) return null;
    return {
      type: "digital_product",
      deliveryMethod: digitalDeliveryFromDatabase[details.deliveryMethod],
      fileFormat: details.fileFormat,
      fileSizeBytes: details.fileSizeBytes?.toString() ?? null,
      version: details.version,
      licenseRequired: details.licenseRequired,
      accessDurationDays: details.accessDurationDays,
      fulfillmentUrl: details.fulfillmentUrl,
    };
  }

  if (product.productKind === DatabaseProductKind.SERVICE) {
    const details = product.serviceDetails;
    if (details === null) return null;
    return {
      type: "service",
      serviceType: details.serviceType,
      deliveryMode: serviceModeFromDatabase[details.deliveryMode],
      durationMinutes: details.durationMinutes,
      location: details.location,
      serviceAreas: details.serviceAreas,
      providerName: details.providerName,
      bookingRequired: details.bookingRequired,
    };
  }

  const details = product.bookingExperienceDetails;
  if (details === null) return null;
  return {
    type: "booking",
    experienceType: details.experienceType,
    destination: details.destination,
    venue: details.venue,
    startsAt: details.startsAt.toISOString(),
    endsAt: details.endsAt.toISOString(),
    timezone: details.timezone,
    capacity: details.capacity,
    minParticipants: details.minParticipants,
    meetingPoint: details.meetingPoint,
  };
}

function toProductVariantRecord(
  variant: ProductWithDetails["variants"][number],
): ProductVariantRecord {
  return {
    variantId: variant.id,
    externalId: variant.externalId,
    sku: variant.sku,
    name: variant.name,
    attributes: scalarAttributes(variant.attributes),
    listedPrice: variant.listedPrice.toNumber(),
    imageUrl: variant.imageUrl,
    active: variant.active,
    quantityAvailable: variant.inventory?.quantityAvailable ?? null,
    quantityReserved: variant.inventory?.quantityReserved ?? null,
    quantityRemaining:
      variant.inventory === null
        ? null
        : calculateAvailableQuantity(
            variant.inventory.quantityAvailable,
            variant.inventory.quantityReserved,
          ),
  };
}

function toProductRecord(product: ProductWithDetails): ProductRecord {
  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    externalId: product.externalId,
    name: product.name,
    description: product.description,
    commerceDomain: commerceDomainMap[product.category.domain],
    categoryId: product.categoryId,
    categoryName: product.category.name,
    productKind: productKindMap[product.productKind],
    billingModel: billingFromDatabase[product.billingModel],
    availabilityModel: availabilityFromDatabase[product.availabilityModel],
    brand: product.brand,
    basePrice: product.basePrice.toNumber(),
    currency: "SGD",
    imageUrl: product.imageUrl,
    attributes: scalarAttributes(product.attributes),
    active: product.active,
    details: mapDetails(product),
    variants: product.variants.map(toProductVariantRecord),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function parseAttributeDefinitions(
  schema: Prisma.JsonValue | null,
): Record<string, AttributeDefinition> {
  if (schema === null || Array.isArray(schema) || typeof schema !== "object") {
    return {};
  }
  const rawAttributes = schema.attributes;
  if (
    rawAttributes === null ||
    Array.isArray(rawAttributes) ||
    typeof rawAttributes !== "object"
  ) {
    return {};
  }

  const parsed: Record<string, AttributeDefinition> = {};
  for (const [key, raw] of Object.entries(rawAttributes)) {
    if (raw === null || Array.isArray(raw) || typeof raw !== "object") continue;
    if (
      (raw.type !== "string" &&
        raw.type !== "number" &&
        raw.type !== "boolean") ||
      (raw.scope !== "product" && raw.scope !== "variant")
    ) {
      continue;
    }
    parsed[key] = {
      type: raw.type,
      scope: raw.scope,
      required: raw.required === true,
    };
  }
  return parsed;
}

function validateAttributeValue(
  key: string,
  value: string | number | boolean,
  expectedType: AttributeDefinition["type"],
  fieldPath: string,
): void {
  if (typeof value !== expectedType) {
    throwValidationError(`${fieldPath}.${key} must be a ${expectedType}.`, {
      field: `${fieldPath}.${key}`,
      expectedType,
    });
  }
}

export function validateCategoryAttributes(input: {
  schema: Prisma.JsonValue | null;
  productAttributes: ProductAttributes;
  variants: Array<{ attributes: ProductAttributes }>;
}): void {
  const definitions = parseAttributeDefinitions(input.schema);

  for (const [key, definition] of Object.entries(definitions)) {
    if (definition.scope === "product") {
      const value = input.productAttributes[key];
      if (value === undefined && definition.required) {
        throwValidationError(`attributes.${key} is required.`, {
          field: `attributes.${key}`,
        });
      }
      if (value !== undefined) {
        validateAttributeValue(key, value, definition.type, "attributes");
      }
      continue;
    }

    for (const [index, variant] of input.variants.entries()) {
      const value = variant.attributes[key];
      if (value === undefined && definition.required) {
        throwValidationError(
          `variants[${index}].attributes.${key} is required.`,
          {
            field: `variants[${index}].attributes.${key}`,
          },
        );
      }
      if (value !== undefined) {
        validateAttributeValue(
          key,
          value,
          definition.type,
          `variants[${index}].attributes`,
        );
      }
    }
  }
}

function stableAttributeKey(attributes: ProductAttributes): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(attributes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function validateVariants(variants: ProductVariantInput[]): void {
  if (variants.length === 0) {
    throwValidationError("At least one ProductVariant is required.", {
      field: "variants",
    });
  }

  const combinations = new Set<string>();
  const skus = new Set<string>();
  for (const [index, variant] of variants.entries()) {
    const combination = stableAttributeKey(variant.attributes);
    if (combinations.has(combination)) {
      throwValidationError("Variant attribute combinations must be unique.", {
        field: `variants[${index}].attributes`,
      });
    }
    combinations.add(combination);

    const sku = optionalText(variant.sku);
    if (sku !== null && skus.has(sku)) {
      throwValidationError("Variant SKUs must be unique.", {
        field: `variants[${index}].sku`,
      });
    }
    if (sku !== null) skus.add(sku);
  }
}

function buildCategoryDetails(
  details: ProductDetailsInput,
): Pick<
  Prisma.ProductCreateInput,
  | "physicalGoodDetails"
  | "digitalProductDetails"
  | "serviceDetails"
  | "bookingExperienceDetails"
> {
  switch (details.type) {
    case "physical_good":
      return {
        physicalGoodDetails: {
          create: {
            weightGrams:
              details.weightGrams == null
                ? null
                : requireNonNegativeInteger(
                    details.weightGrams,
                    "details.weightGrams",
                  ),
            lengthCm:
              details.lengthCm == null
                ? null
                : requireNonNegative(details.lengthCm, "details.lengthCm"),
            widthCm:
              details.widthCm == null
                ? null
                : requireNonNegative(details.widthCm, "details.widthCm"),
            heightCm:
              details.heightCm == null
                ? null
                : requireNonNegative(details.heightCm, "details.heightCm"),
            shippingRequired: details.shippingRequired ?? true,
          },
        },
      };
    case "digital_product":
      return {
        digitalProductDetails: {
          create: {
            deliveryMethod: digitalDeliveryToDatabase[details.deliveryMethod],
            fileFormat: optionalText(details.fileFormat),
            fileSizeBytes:
              details.fileSizeBytes == null
                ? null
                : BigInt(
                    requireNonNegativeInteger(
                      details.fileSizeBytes,
                      "details.fileSizeBytes",
                    ),
                  ),
            version: optionalText(details.version),
            licenseRequired: details.licenseRequired ?? false,
            accessDurationDays:
              details.accessDurationDays == null
                ? null
                : requirePositiveInteger(
                    details.accessDurationDays,
                    "details.accessDurationDays",
                  ),
            fulfillmentUrl: optionalText(details.fulfillmentUrl),
          },
        },
      };
    case "service":
      return {
        serviceDetails: {
          create: {
            serviceType: requireNonEmpty(
              details.serviceType,
              "details.serviceType",
            ),
            deliveryMode: serviceModeToDatabase[details.deliveryMode],
            durationMinutes: requirePositiveInteger(
              details.durationMinutes,
              "details.durationMinutes",
            ),
            location: optionalText(details.location),
            serviceAreas: cleanOptions(details.serviceAreas),
            providerName: optionalText(details.providerName),
            bookingRequired: details.bookingRequired ?? true,
          },
        },
      };
    case "booking": {
      const startsAt = requireDate(details.startsAt, "details.startsAt");
      const endsAt = requireDate(details.endsAt, "details.endsAt");
      const capacity = requirePositiveInteger(
        details.capacity,
        "details.capacity",
      );
      const minParticipants = requirePositiveInteger(
        details.minParticipants ?? 1,
        "details.minParticipants",
      );
      if (endsAt <= startsAt) {
        throwValidationError("details.endsAt must be after details.startsAt.", {
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      }
      if (minParticipants > capacity) {
        throwValidationError(
          "details.minParticipants must not exceed details.capacity.",
          { minParticipants, capacity },
        );
      }
      return {
        bookingExperienceDetails: {
          create: {
            experienceType: optionalText(details.experienceType),
            destination: requireNonEmpty(
              details.destination,
              "details.destination",
            ),
            venue: optionalText(details.venue),
            startsAt,
            endsAt,
            timezone: optionalText(details.timezone) ?? "Asia/Singapore",
            capacity,
            minParticipants,
            meetingPoint: optionalText(details.meetingPoint),
          },
        },
      };
    }
  }
}

export async function createProduct(
  input: CreateProductInput,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, name: true },
  });
  if (merchant === null) throwNotFound("Merchant", input.merchantId);

  const category = await database.category.findFirst({
    where: { id: input.categoryId, active: true },
    include: {
      children: { where: { active: true }, select: { id: true } },
      schemas: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (category === null) throwNotFound("Category", input.categoryId);
  if (category.children.length > 0) {
    throwValidationError("Select the most specific leaf category.", {
      categoryId: input.categoryId,
    });
  }

  const expectedKind = productKindMap[category.productKind];
  if (input.details.type !== expectedKind) {
    throwValidationError(
      `details.type must be ${expectedKind} for ${category.id}.`,
      { categoryId: category.id, expectedKind },
    );
  }

  validateVariants(input.variants);
  validateCategoryAttributes({
    schema: category.schemas[0]?.attributeSchema ?? null,
    productAttributes: input.attributes,
    variants: input.variants,
  });

  const basePrice = roundMoney(
    requireNonNegative(input.basePrice, "basePrice"),
  );
  const product = await database.$transaction(async (transaction) => {
    const existingSkuRows = await transaction.productVariant.findMany({
      where: { merchantId: input.merchantId, sku: { not: null } },
      select: { sku: true },
    });
    const usedSkus = new Set(
      existingSkuRows.flatMap(({ sku }) => (sku === null ? [] : [sku])),
    );
    for (const variant of input.variants) {
      const suppliedSku = optionalText(variant.sku);
      if (suppliedSku !== null) usedSkus.add(suppliedSku);
    }

    const created = await transaction.product.create({
      data: {
        merchant: { connect: { id: input.merchantId } },
        category: { connect: { id: category.id } },
        externalId: optionalText(input.externalId),
        productKind: category.productKind,
        billingModel:
          input.billingModel === undefined
            ? category.defaultBillingModel
            : billingToDatabase[input.billingModel],
        availabilityModel:
          input.availabilityModel === undefined
            ? category.defaultAvailabilityModel
            : availabilityToDatabase[input.availabilityModel],
        name: requireNonEmpty(input.name, "name"),
        description: optionalText(input.description),
        brand: optionalText(input.brand),
        basePrice,
        currency: input.currency ?? "SGD",
        imageUrl: optionalText(input.imageUrl),
        attributes: input.attributes as Prisma.InputJsonObject,
        active: input.active ?? true,
        ...buildCategoryDetails(input.details),
      },
    });

    for (const [index, variant] of input.variants.entries()) {
      const suppliedSku = optionalText(variant.sku);
      const sku =
        suppliedSku ??
        nextAvailableSku(
          buildAutomaticSku({
            merchantName: merchant.name,
            productName: input.name,
            variantName: variant.name,
            attributes: variant.attributes,
            position: index,
          }),
          usedSkus,
        );
      usedSkus.add(sku);
      await transaction.productVariant.create({
        data: {
          merchantId: input.merchantId,
          productId: created.id,
          externalId: optionalText(variant.externalId),
          sku,
          name: optionalText(variant.name),
          attributes: variant.attributes as Prisma.InputJsonObject,
          listedPrice: roundMoney(
            requireNonNegative(
              variant.listedPrice ?? basePrice,
              "variant.listedPrice",
            ),
          ),
          imageUrl: optionalText(variant.imageUrl),
          active: variant.active ?? true,
        },
      });
    }

    return transaction.product.findUnique({
      where: { id: created.id },
      include: productInclude,
    });
  });

  if (product === null) throwNotFound("Product", "created product");
  return toProductRecord(product);
}

export async function listMerchantProducts(
  merchantId: string,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });
  if (merchant === null) throwNotFound("Merchant", merchantId);

  const products = await database.product.findMany({
    where: { merchantId },
    include: productInclude,
    orderBy: { createdAt: "asc" },
  });
  return products.map(toProductRecord);
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const existing = await database.product.findUnique({
    where: { id: productId },
    select: { basePrice: true },
  });
  if (existing === null) throwNotFound("Product", productId);

  const nextBasePrice =
    input.basePrice === undefined
      ? undefined
      : roundMoney(requireNonNegative(input.basePrice, "basePrice"));
  const data: Prisma.ProductUpdateInput = {
    ...(input.externalId === undefined
      ? {}
      : { externalId: optionalText(input.externalId) }),
    ...(input.name === undefined
      ? {}
      : { name: requireNonEmpty(input.name, "name") }),
    ...(input.description === undefined
      ? {}
      : { description: optionalText(input.description) }),
    ...(input.brand === undefined ? {} : { brand: optionalText(input.brand) }),
    ...(nextBasePrice === undefined ? {} : { basePrice: nextBasePrice }),
    ...(input.imageUrl === undefined
      ? {}
      : { imageUrl: optionalText(input.imageUrl) }),
    ...(input.attributes === undefined
      ? {}
      : { attributes: input.attributes as Prisma.InputJsonObject }),
    ...(input.active === undefined ? {} : { active: input.active }),
  };

  const product = await database.$transaction(async (transaction) => {
    await transaction.product.update({ where: { id: productId }, data });
    if (nextBasePrice !== undefined) {
      await transaction.productVariant.updateMany({
        where: { productId, listedPrice: existing.basePrice },
        data: { listedPrice: nextBasePrice },
      });
    }
    return transaction.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });
  });

  if (product === null) throwNotFound("Product", productId);
  return toProductRecord(product);
}

export async function updateProductVariant(
  variantId: string,
  input: UpdateProductVariantInput,
  dependencies: CommerceDependencies = {},
): Promise<ProductVariantRecord> {
  const database = getCommerceDatabase(dependencies);
  const existing = await database.productVariant.findUnique({
    where: { id: variantId },
    include: {
      inventory: true,
      product: {
        select: {
          attributes: true,
          category: {
            select: {
              schemas: {
                where: { active: true },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { attributeSchema: true },
              },
            },
          },
          variants: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              externalId: true,
              sku: true,
              name: true,
              attributes: true,
              listedPrice: true,
              imageUrl: true,
              active: true,
            },
          },
        },
      },
    },
  });
  if (existing === null) throwNotFound("ProductVariant", variantId);

  const listedPrice =
    input.listedPrice === undefined
      ? undefined
      : roundMoney(requireNonNegative(input.listedPrice, "listedPrice"));
  const candidateVariants: ProductVariantInput[] =
    existing.product.variants.map((variant) =>
      variant.id === variantId
        ? {
            externalId:
              input.externalId === undefined
                ? variant.externalId
                : optionalText(input.externalId),
            sku:
              input.sku === undefined ? variant.sku : optionalText(input.sku),
            name:
              input.name === undefined
                ? variant.name
                : optionalText(input.name),
            attributes:
              input.attributes ?? scalarAttributes(variant.attributes),
            listedPrice: listedPrice ?? variant.listedPrice.toNumber(),
            imageUrl:
              input.imageUrl === undefined
                ? variant.imageUrl
                : optionalText(input.imageUrl),
            active: input.active ?? variant.active,
          }
        : {
            externalId: variant.externalId,
            sku: variant.sku,
            name: variant.name,
            attributes: scalarAttributes(variant.attributes),
            listedPrice: variant.listedPrice.toNumber(),
            imageUrl: variant.imageUrl,
            active: variant.active,
          },
    );

  validateVariants(candidateVariants);
  validateCategoryAttributes({
    schema: existing.product.category.schemas[0]?.attributeSchema ?? null,
    productAttributes: scalarAttributes(existing.product.attributes),
    variants: candidateVariants,
  });

  const updated = await database.productVariant.update({
    where: { id: variantId },
    data: {
      ...(input.externalId === undefined
        ? {}
        : { externalId: optionalText(input.externalId) }),
      ...(input.sku === undefined ? {} : { sku: optionalText(input.sku) }),
      ...(input.name === undefined ? {} : { name: optionalText(input.name) }),
      ...(input.attributes === undefined
        ? {}
        : { attributes: input.attributes as Prisma.InputJsonObject }),
      ...(listedPrice === undefined ? {} : { listedPrice }),
      ...(input.imageUrl === undefined
        ? {}
        : { imageUrl: optionalText(input.imageUrl) }),
      ...(input.active === undefined ? {} : { active: input.active }),
    },
    include: { inventory: true },
  });

  return toProductVariantRecord(updated);
}
