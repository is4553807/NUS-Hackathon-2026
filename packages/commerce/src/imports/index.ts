import { Prisma, ProductKind as DatabaseProductKind } from "@visa-commerce/db";

import type { JsonObject } from "../catalog/index.js";
import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import { requireNonEmpty } from "../validation.js";

export type SaveImportProfileInput = {
  merchantId: string;
  categoryId: string;
  name: string;
  schemaVersion: string;
  sourceHeaders: string[];
  columnMapping: Record<string, string>;
  normalizationRules?: JsonObject | null;
};

export type ImportProfileRecord = {
  importProfileId: string;
  merchantId: string;
  categoryId: string;
  name: string;
  schemaVersion: string;
  sourceHeaders: string[];
  columnMapping: Record<string, string>;
  normalizationRules: JsonObject | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ImportMappingValidationInput = {
  sourceHeaders: string[];
  columnMapping: Record<string, string>;
  attributeSchema: Prisma.JsonValue;
  productKind: DatabaseProductKind;
};

const commonImportTargets = [
  "product.externalId",
  "product.name",
  "product.description",
  "product.brand",
  "product.basePrice",
  "product.currency",
  "product.imageUrl",
  "variant.externalId",
  "variant.sku",
  "variant.name",
  "variant.listedPrice",
  "variant.imageUrl",
  "inventory.quantityAvailable",
  "inventory.quantityReserved",
] as const;

const detailImportTargets: Record<DatabaseProductKind, readonly string[]> = {
  PHYSICAL_GOOD: [
    "details.weightGrams",
    "details.lengthCm",
    "details.widthCm",
    "details.heightCm",
    "details.shippingRequired",
  ],
  DIGITAL_PRODUCT: [
    "details.deliveryMethod",
    "details.fileFormat",
    "details.fileSizeBytes",
    "details.version",
    "details.licenseRequired",
    "details.accessDurationDays",
    "details.fulfillmentUrl",
  ],
  SERVICE: [
    "details.serviceType",
    "details.deliveryMode",
    "details.durationMinutes",
    "details.location",
    "details.providerName",
    "details.bookingRequired",
  ],
  BOOKING: [
    "details.experienceType",
    "details.destination",
    "details.venue",
    "details.startsAt",
    "details.endsAt",
    "details.timezone",
    "details.capacity",
    "details.minParticipants",
    "details.meetingPoint",
  ],
};

function categoryAttributeTargets(attributeSchema: Prisma.JsonValue): {
  allowed: string[];
  required: string[];
} {
  if (
    attributeSchema === null ||
    Array.isArray(attributeSchema) ||
    typeof attributeSchema !== "object" ||
    attributeSchema.attributes === null ||
    Array.isArray(attributeSchema.attributes) ||
    typeof attributeSchema.attributes !== "object"
  ) {
    return { allowed: [], required: [] };
  }

  const allowed: string[] = [];
  const required: string[] = [];
  for (const [key, definition] of Object.entries(attributeSchema.attributes)) {
    if (
      definition === null ||
      Array.isArray(definition) ||
      typeof definition !== "object" ||
      (definition.scope !== "product" && definition.scope !== "variant")
    ) {
      continue;
    }
    const target = `${definition.scope}.attributes.${key}`;
    allowed.push(target);
    if (definition.required === true) required.push(target);
  }
  return { allowed, required };
}

export function validateImportMapping(
  input: ImportMappingValidationInput,
): void {
  const sourceHeaders = new Set(input.sourceHeaders);
  const mappings = Object.entries(input.columnMapping);
  const unknownSources = mappings
    .map(([source]) => source)
    .filter((source) => !sourceHeaders.has(source));
  if (unknownSources.length > 0) {
    throwValidationError(
      "Every mapped source column must exist in sourceHeaders.",
      { unknownSources },
    );
  }

  const categoryTargets = categoryAttributeTargets(input.attributeSchema);
  const allowedTargets = new Set([
    ...commonImportTargets,
    ...detailImportTargets[input.productKind],
    ...categoryTargets.allowed,
  ]);
  const mappedTargets = mappings.map(([, target]) => target);
  const unknownTargets = mappedTargets.filter(
    (target) => !allowedTargets.has(target),
  );
  if (unknownTargets.length > 0) {
    throwValidationError("CSV columns must map to canonical catalog paths.", {
      unknownTargets,
    });
  }

  const duplicateTargets = mappedTargets.filter(
    (target, index) => mappedTargets.indexOf(target) !== index,
  );
  if (duplicateTargets.length > 0) {
    throwValidationError(
      "Multiple CSV columns cannot map to the same canonical path.",
      { duplicateTargets: [...new Set(duplicateTargets)] },
    );
  }

  const mappedTargetSet = new Set(mappedTargets);
  const requiredTargets = ["product.name", ...categoryTargets.required];
  const missingTargets = requiredTargets.filter(
    (target) => !mappedTargetSet.has(target),
  );
  if (
    !mappedTargetSet.has("product.basePrice") &&
    !mappedTargetSet.has("variant.listedPrice")
  ) {
    missingTargets.push("product.basePrice or variant.listedPrice");
  }
  if (missingTargets.length > 0) {
    throwValidationError("CSV mapping is missing required canonical fields.", {
      missingTargets,
    });
  }
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toImportProfileRecord(profile: {
  id: string;
  merchantId: string;
  categoryId: string;
  name: string;
  schemaVersion: string;
  sourceHeaders: Prisma.JsonValue;
  columnMapping: Prisma.JsonValue;
  normalizationRules: Prisma.JsonValue | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ImportProfileRecord {
  return {
    importProfileId: profile.id,
    merchantId: profile.merchantId,
    categoryId: profile.categoryId,
    name: profile.name,
    schemaVersion: profile.schemaVersion,
    sourceHeaders: stringArray(profile.sourceHeaders),
    columnMapping: stringRecord(profile.columnMapping),
    normalizationRules:
      (profile.normalizationRules as JsonObject | null) ?? null,
    active: profile.active,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function saveImportProfile(
  input: SaveImportProfileInput,
  dependencies: CommerceDependencies = {},
): Promise<ImportProfileRecord> {
  const database = getCommerceDatabase(dependencies);
  const schemaVersion = requireNonEmpty(input.schemaVersion, "schemaVersion");
  const [merchant, categorySchema] = await Promise.all([
    database.merchant.findUnique({
      where: { id: input.merchantId },
      select: { id: true },
    }),
    database.categorySchema.findFirst({
      where: {
        categoryId: input.categoryId,
        version: schemaVersion,
        active: true,
        category: { active: true },
      },
      select: {
        attributeSchema: true,
        category: { select: { productKind: true } },
      },
    }),
  ]);
  if (merchant === null) throwNotFound("Merchant", input.merchantId);
  if (categorySchema === null) {
    throwNotFound("Category schema", `${input.categoryId}@${schemaVersion}`);
  }

  const sourceHeaders = [
    ...new Set(
      input.sourceHeaders
        .map((header) => header.trim())
        .filter((header) => header.length > 0),
    ),
  ];
  const columnMapping = Object.fromEntries(
    Object.entries(input.columnMapping)
      .map(([source, target]) => [source.trim(), target.trim()] as const)
      .filter(([source, target]) => source.length > 0 && target.length > 0),
  );
  validateImportMapping({
    sourceHeaders,
    columnMapping,
    attributeSchema: categorySchema.attributeSchema,
    productKind: categorySchema.category.productKind,
  });

  const profile = await database.merchantImportProfile.upsert({
    where: {
      merchantId_name: {
        merchantId: input.merchantId,
        name: requireNonEmpty(input.name, "name"),
      },
    },
    create: {
      merchantId: input.merchantId,
      categoryId: input.categoryId,
      name: requireNonEmpty(input.name, "name"),
      schemaVersion,
      sourceHeaders,
      columnMapping,
      normalizationRules:
        input.normalizationRules == null
          ? undefined
          : (input.normalizationRules as Prisma.InputJsonObject),
    },
    update: {
      categoryId: input.categoryId,
      schemaVersion,
      sourceHeaders,
      columnMapping,
      normalizationRules:
        input.normalizationRules === null
          ? Prisma.JsonNull
          : input.normalizationRules === undefined
            ? undefined
            : (input.normalizationRules as Prisma.InputJsonObject),
      active: true,
    },
  });
  return toImportProfileRecord(profile);
}

export async function listImportProfiles(
  merchantId: string,
  dependencies: CommerceDependencies = {},
): Promise<ImportProfileRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });
  if (merchant === null) throwNotFound("Merchant", merchantId);
  const profiles = await database.merchantImportProfile.findMany({
    where: { merchantId, active: true },
    orderBy: { createdAt: "asc" },
  });
  return profiles.map(toImportProfileRecord);
}
