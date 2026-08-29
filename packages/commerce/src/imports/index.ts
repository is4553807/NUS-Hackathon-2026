import { Prisma, ProductKind as DatabaseProductKind } from "@visa-commerce/db";
import type { ProductAttributes } from "@visa-commerce/contracts";

import {
  createProduct,
  listMerchantProducts,
  type CreateProductInput,
  type JsonObject,
  type ProductDetailsInput,
  type ProductRecord,
} from "../catalog/index.js";
import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import { upsertInventory } from "../inventory/index.js";
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

export type CatalogImportPreview = {
  categoryId: string;
  categoryName: string;
  schemaVersion: string;
  rowCount: number;
  headers: string[];
  columnMapping: Record<string, string>;
  targets: Array<{ target: string; label: string; required: boolean }>;
  unmappedHeaders: string[];
  missingRequiredTargets: string[];
  canImport: boolean;
  sampleRows: Array<Record<string, string>>;
};

export type PreviewCatalogImportInput = {
  merchantId: string;
  categoryId: string;
  fileName: string;
  csvText: string;
  columnMapping?: Record<string, string>;
};

export type ExecuteCatalogImportInput = PreviewCatalogImportInput & {
  columnMapping: Record<string, string>;
};

export type CatalogImportResult = {
  products: ProductRecord[];
  importedProductCount: number;
  importedVariantCount: number;
  importProfile: ImportProfileRecord;
};

export type InventoryCsvExport = {
  fileName: string;
  content: string;
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
  "product.active",
  "variant.externalId",
  "variant.sku",
  "variant.name",
  "variant.listedPrice",
  "variant.imageUrl",
  "variant.active",
  "inventory.quantityAvailable",
  "inventory.quantityReserved",
] as const;

const detailRequiredTargets: Partial<
  Record<DatabaseProductKind, readonly string[]>
> = {
  [DatabaseProductKind.DIGITAL_PRODUCT]: ["details.deliveryMethod"],
  [DatabaseProductKind.BOOKING]: ["details.endsAt", "details.capacity"],
};

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

type AttributeImportDefinition = {
  key: string;
  type: "string" | "number" | "boolean";
  scope: "product" | "variant";
  required: boolean;
  aliases: string[];
};

type ImportTargetOption = {
  target: string;
  label: string;
  required: boolean;
  aliases: string[];
};

const commonTargetOptions: ImportTargetOption[] = [
  {
    target: "product.externalId",
    label: "External product ID",
    required: false,
    aliases: ["product_id", "item_id", "external_product_id"],
  },
  {
    target: "product.name",
    label: "Product name",
    required: true,
    aliases: [
      "name",
      "product_name",
      "product_title",
      "item_name",
      "item_title",
      "title",
    ],
  },
  {
    target: "product.description",
    label: "Description",
    required: false,
    aliases: ["description", "product_description", "details"],
  },
  {
    target: "product.brand",
    label: "Brand",
    required: false,
    aliases: ["brand", "brand_name", "manufacturer"],
  },
  {
    target: "product.basePrice",
    label: "Base price",
    required: false,
    aliases: [
      "price",
      "base_price",
      "unit_price",
      "unit_price_sgd",
      "price_sgd",
      "retail_price",
    ],
  },
  {
    target: "product.currency",
    label: "Currency",
    required: false,
    aliases: ["currency", "currency_code"],
  },
  {
    target: "product.imageUrl",
    label: "Product image URL",
    required: false,
    aliases: ["image", "image_url", "product_image", "photo_url"],
  },
  {
    target: "product.active",
    label: "Product active",
    required: false,
    aliases: ["product_active", "is_active", "published"],
  },
  {
    target: "variant.externalId",
    label: "External variant ID",
    required: false,
    aliases: ["variant_id", "external_variant_id", "option_id"],
  },
  {
    target: "variant.sku",
    label: "SKU",
    required: false,
    aliases: ["sku", "item_code", "product_code", "stock_code"],
  },
  {
    target: "variant.name",
    label: "Variant name",
    required: false,
    aliases: ["variant_name", "option_name", "variation"],
  },
  {
    target: "variant.listedPrice",
    label: "Variant price",
    required: false,
    aliases: ["variant_price", "listed_price", "sale_price"],
  },
  {
    target: "variant.imageUrl",
    label: "Variant image URL",
    required: false,
    aliases: ["variant_image", "variant_image_url", "option_image"],
  },
  {
    target: "variant.active",
    label: "Variant active",
    required: false,
    aliases: ["variant_active", "option_active"],
  },
  {
    target: "inventory.quantityAvailable",
    label: "Available inventory",
    required: false,
    aliases: [
      "inventory",
      "stock",
      "stock_on_hand",
      "quantity",
      "quantity_available",
      "qty",
      "available_qty",
    ],
  },
  {
    target: "inventory.quantityReserved",
    label: "Reserved inventory",
    required: false,
    aliases: ["quantity_reserved", "reserved", "reserved_qty"],
  },
];

const detailTargetAliases: Record<string, string[]> = {
  "details.weightGrams": ["weight", "weight_grams", "weight_g"],
  "details.lengthCm": ["length", "length_cm"],
  "details.widthCm": ["width", "width_cm"],
  "details.heightCm": ["height", "height_cm"],
  "details.shippingRequired": ["shipping_required", "requires_shipping"],
  "details.deliveryMethod": ["delivery_method", "digital_delivery"],
  "details.fileFormat": ["file_format", "format"],
  "details.fileSizeBytes": ["file_size_bytes", "file_size"],
  "details.version": ["version", "product_version"],
  "details.licenseRequired": ["license_required"],
  "details.accessDurationDays": ["access_days", "access_duration_days"],
  "details.fulfillmentUrl": ["fulfillment_url", "download_url"],
  "details.serviceType": ["service_type"],
  "details.deliveryMode": ["delivery_mode", "service_mode"],
  "details.durationMinutes": ["service_duration", "duration_minutes"],
  "details.location": ["location", "service_location"],
  "details.providerName": ["provider", "provider_name"],
  "details.bookingRequired": ["booking_required"],
  "details.experienceType": ["experience_type", "activity_type"],
  "details.destination": ["destination"],
  "details.venue": ["venue"],
  "details.startsAt": ["starts_at", "start_time", "start_datetime"],
  "details.endsAt": ["ends_at", "end_time", "end_datetime"],
  "details.timezone": ["timezone", "time_zone"],
  "details.capacity": ["capacity", "max_guests", "available_seats"],
  "details.minParticipants": ["min_participants", "minimum_guests"],
  "details.meetingPoint": ["meeting_point"],
};

const attributeAliasesByKey: Record<string, string[]> = {
  productType: ["item_type", "product_category", "item_category"],
  model: ["model_name"],
  serviceType: ["service_category"],
  experienceType: ["activity_type"],
  billingInterval: ["subscription_period"],
};

function titleFromTarget(target: string): string {
  const last = target.split(".").at(-1) ?? target;
  return last
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function attributeImportDefinitions(
  attributeSchema: Prisma.JsonValue,
): AttributeImportDefinition[] {
  if (
    attributeSchema === null ||
    Array.isArray(attributeSchema) ||
    typeof attributeSchema !== "object" ||
    attributeSchema.attributes === null ||
    Array.isArray(attributeSchema.attributes) ||
    typeof attributeSchema.attributes !== "object"
  ) {
    return [];
  }

  const definitions: AttributeImportDefinition[] = [];
  for (const [key, definition] of Object.entries(attributeSchema.attributes)) {
    if (
      definition === null ||
      Array.isArray(definition) ||
      typeof definition !== "object" ||
      (definition.scope !== "product" && definition.scope !== "variant") ||
      (definition.type !== "string" &&
        definition.type !== "number" &&
        definition.type !== "boolean")
    ) {
      continue;
    }
    definitions.push({
      key,
      type: definition.type,
      scope: definition.scope,
      required: definition.required === true,
      aliases: Array.isArray(definition.aliases)
        ? definition.aliases.filter(
            (alias): alias is string => typeof alias === "string",
          )
        : [],
    });
  }
  return definitions;
}

function importTargetOptions(
  attributeSchema: Prisma.JsonValue,
  productKind: DatabaseProductKind,
): ImportTargetOption[] {
  const detailRequired = new Set(detailRequiredTargets[productKind] ?? []);
  return [
    ...commonTargetOptions,
    ...detailImportTargets[productKind].map((target) => ({
      target,
      label: titleFromTarget(target),
      required: detailRequired.has(target),
      aliases: detailTargetAliases[target] ?? [],
    })),
    ...attributeImportDefinitions(attributeSchema).map((definition) => ({
      target: `${definition.scope}.attributes.${definition.key}`,
      label: `${definition.scope === "product" ? "Product" : "Variant"} ${titleFromTarget(definition.key)}`,
      required: definition.required,
      aliases: [
        definition.key,
        ...(attributeAliasesByKey[definition.key] ?? []),
        ...definition.aliases,
      ],
    })),
  ];
}

function categoryAttributeTargets(attributeSchema: Prisma.JsonValue): {
  allowed: string[];
  required: string[];
} {
  const definitions = attributeImportDefinitions(attributeSchema);
  return {
    allowed: definitions.map(
      (definition) => `${definition.scope}.attributes.${definition.key}`,
    ),
    required: definitions
      .filter((definition) => definition.required)
      .map((definition) => `${definition.scope}.attributes.${definition.key}`),
  };
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
  const requiredTargets = [
    "product.name",
    ...(detailRequiredTargets[input.productKind] ?? []),
    ...categoryTargets.required,
  ];
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

export type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export function parseCsvText(csvText: string): ParsedCsv {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  function finishRecord(): void {
    record.push(field);
    field = "";
    if (record.some((value) => value.trim().length > 0)) records.push(record);
    record = [];
  }

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (quoted) {
      if (character === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throwValidationError(
          "CSV quotes must start at the beginning of a field.",
        );
      }
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      finishRecord();
    } else if (character === "\r") {
      if (csvText[index + 1] === "\n") index += 1;
      finishRecord();
    } else {
      field += character;
    }
  }

  if (quoted) throwValidationError("CSV contains an unclosed quoted field.");
  if (field.length > 0 || record.length > 0) finishRecord();
  if (records.length < 2) {
    throwValidationError(
      "CSV must contain a header row and at least one data row.",
    );
  }

  const [rawHeaders, ...dataRows] = records;
  if (rawHeaders === undefined)
    throwValidationError("CSV header row is missing.");
  const headers = rawHeaders.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  if (headers.some((header) => header.length === 0)) {
    throwValidationError("CSV headers cannot be blank.");
  }
  if (new Set(headers).size !== headers.length) {
    throwValidationError("CSV headers must be unique.");
  }
  if (headers.length > 200) {
    throwValidationError("CSV cannot contain more than 200 columns.");
  }
  if (dataRows.length > 2_000) {
    throwValidationError("CSV cannot contain more than 2,000 data rows.");
  }

  const rows = dataRows.map((values, rowIndex) => {
    if (values.length > headers.length) {
      throwValidationError(`CSV row ${rowIndex + 2} has too many columns.`, {
        row: rowIndex + 2,
      });
    }
    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, values[columnIndex] ?? ""]),
    );
  });
  return { headers, rows };
}

function normalizedHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replaceAll(/[^a-z0-9]+/g, "");
}

export function suggestImportMapping(input: {
  headers: string[];
  attributeSchema: Prisma.JsonValue;
  productKind: DatabaseProductKind;
}): Record<string, string> {
  const options = importTargetOptions(input.attributeSchema, input.productKind);
  const mapping: Record<string, string> = {};
  const usedTargets = new Set<string>();

  for (const header of input.headers) {
    const normalized = normalizedHeader(header);
    const exactCanonical = options.find(
      (option) =>
        option.target.toLocaleLowerCase("en") ===
        header.toLocaleLowerCase("en"),
    );
    const candidates = exactCanonical
      ? [exactCanonical]
      : options.filter((option) =>
          [option.target, ...option.aliases].some(
            (alias) => normalizedHeader(alias) === normalized,
          ),
        );
    const available = candidates.filter(
      (candidate) => !usedTargets.has(candidate.target),
    );
    const preferred =
      available.length === 1
        ? available
        : available.filter((candidate) => candidate.required);
    if (preferred.length === 1) {
      const target = preferred[0]?.target;
      if (target !== undefined) {
        mapping[header] = target;
        usedTargets.add(target);
      }
    }
  }
  return mapping;
}

function missingRequiredTargets(input: {
  mapping: Record<string, string>;
  attributeSchema: Prisma.JsonValue;
  productKind: DatabaseProductKind;
}): string[] {
  const mapped = new Set(Object.values(input.mapping));
  const required = importTargetOptions(input.attributeSchema, input.productKind)
    .filter((option) => option.required)
    .map((option) => option.target);
  if (!mapped.has("product.basePrice") && !mapped.has("variant.listedPrice")) {
    required.push("product.basePrice or variant.listedPrice");
  }
  return required.filter((target) => !mapped.has(target));
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

type CatalogImportContext = {
  categoryId: string;
  categoryName: string;
  schemaVersion: string;
  attributeSchema: Prisma.JsonValue;
  productKind: DatabaseProductKind;
};

type PlannedCatalogProduct = {
  input: CreateProductInput;
  inventory: Array<{ quantityAvailable: number; quantityReserved: number }>;
};

async function loadCatalogImportContext(
  merchantId: string,
  categoryId: string,
  dependencies: CommerceDependencies,
): Promise<CatalogImportContext> {
  const database = getCommerceDatabase(dependencies);
  const [merchant, categorySchema] = await Promise.all([
    database.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    }),
    database.categorySchema.findFirst({
      where: {
        categoryId,
        active: true,
        category: { active: true },
      },
      orderBy: { createdAt: "desc" },
      select: {
        version: true,
        attributeSchema: true,
        category: { select: { name: true, productKind: true } },
      },
    }),
  ]);
  if (merchant === null) throwNotFound("Merchant", merchantId);
  if (categorySchema === null) throwNotFound("Category schema", categoryId);
  return {
    categoryId,
    categoryName: categorySchema.category.name,
    schemaVersion: categorySchema.version,
    attributeSchema: categorySchema.attributeSchema,
    productKind: categorySchema.category.productKind,
  };
}

function cleanMapping(
  mapping: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapping ?? {})
      .map(([source, target]) => [source.trim(), target.trim()] as const)
      .filter(([source, target]) => source.length > 0 && target.length > 0),
  );
}

function reverseMapping(mapping: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(mapping).map(([source, target]) => [target, source]),
  );
}

function mappedText(
  row: Record<string, string>,
  sourcesByTarget: ReadonlyMap<string, string>,
  target: string,
): string | null {
  const source = sourcesByTarget.get(target);
  if (source === undefined) return null;
  const value = row[source]?.trim() ?? "";
  return value.length === 0 ? null : value;
}

function mappedNumber(
  row: Record<string, string>,
  sourcesByTarget: ReadonlyMap<string, string>,
  target: string,
  rowNumber: number,
): number | null {
  const value = mappedText(row, sourcesByTarget, target);
  if (value === null) return null;
  const normalized = value
    .replace(/^SGD\s*/i, "")
    .replace(/^S\$\s*/i, "")
    .replaceAll(",", "")
    .trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throwValidationError(`CSV row ${rowNumber}: ${target} must be a number.`, {
      row: rowNumber,
      target,
      value,
    });
  }
  return parsed;
}

function mappedBoolean(
  row: Record<string, string>,
  sourcesByTarget: ReadonlyMap<string, string>,
  target: string,
  rowNumber: number,
): boolean | null {
  const value = mappedText(row, sourcesByTarget, target);
  if (value === null) return null;
  const normalized = value.toLocaleLowerCase("en");
  if (["true", "yes", "y", "1", "active"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(normalized)) {
    return false;
  }
  throwValidationError(
    `CSV row ${rowNumber}: ${target} must be true/false or yes/no.`,
    { row: rowNumber, target, value },
  );
}

function readRowAttributes(input: {
  row: Record<string, string>;
  rowNumber: number;
  sourcesByTarget: ReadonlyMap<string, string>;
  definitions: AttributeImportDefinition[];
  scope: "product" | "variant";
}): ProductAttributes {
  const attributes: ProductAttributes = {};
  for (const definition of input.definitions.filter(
    (candidate) => candidate.scope === input.scope,
  )) {
    const target = `${input.scope}.attributes.${definition.key}`;
    const raw = mappedText(input.row, input.sourcesByTarget, target);
    if (raw === null) {
      if (definition.required) {
        throwValidationError(
          `CSV row ${input.rowNumber}: ${target} is required.`,
          { row: input.rowNumber, target },
        );
      }
      continue;
    }
    if (definition.type === "number") {
      const value = mappedNumber(
        input.row,
        input.sourcesByTarget,
        target,
        input.rowNumber,
      );
      if (value !== null) attributes[definition.key] = value;
    } else if (definition.type === "boolean") {
      const value = mappedBoolean(
        input.row,
        input.sourcesByTarget,
        target,
        input.rowNumber,
      );
      if (value !== null) attributes[definition.key] = value;
    } else {
      attributes[definition.key] = raw;
    }
  }
  return attributes;
}

function requireMappedText(
  row: Record<string, string>,
  sourcesByTarget: ReadonlyMap<string, string>,
  target: string,
  rowNumber: number,
): string {
  const value = mappedText(row, sourcesByTarget, target);
  if (value === null) {
    throwValidationError(`CSV row ${rowNumber}: ${target} is required.`, {
      row: rowNumber,
      target,
    });
  }
  return value;
}

function requireMappedNumber(
  row: Record<string, string>,
  sourcesByTarget: ReadonlyMap<string, string>,
  target: string,
  rowNumber: number,
): number {
  const value = mappedNumber(row, sourcesByTarget, target, rowNumber);
  if (value === null) {
    throwValidationError(`CSV row ${rowNumber}: ${target} is required.`, {
      row: rowNumber,
      target,
    });
  }
  return value;
}

function buildRowDetails(input: {
  productKind: DatabaseProductKind;
  row: Record<string, string>;
  rowNumber: number;
  sourcesByTarget: ReadonlyMap<string, string>;
  productAttributes: ProductAttributes;
  variantAttributes: ProductAttributes;
}): ProductDetailsInput {
  const text = (target: string) =>
    mappedText(input.row, input.sourcesByTarget, target);
  const number = (target: string) =>
    mappedNumber(input.row, input.sourcesByTarget, target, input.rowNumber);
  const boolean = (target: string) =>
    mappedBoolean(input.row, input.sourcesByTarget, target, input.rowNumber);

  if (input.productKind === DatabaseProductKind.PHYSICAL_GOOD) {
    return {
      type: "physical_good",
      weightGrams: number("details.weightGrams"),
      lengthCm: number("details.lengthCm"),
      widthCm: number("details.widthCm"),
      heightCm: number("details.heightCm"),
      shippingRequired: boolean("details.shippingRequired") ?? true,
    };
  }
  if (input.productKind === DatabaseProductKind.DIGITAL_PRODUCT) {
    const deliveryMethod = requireMappedText(
      input.row,
      input.sourcesByTarget,
      "details.deliveryMethod",
      input.rowNumber,
    );
    if (
      !["download", "license_key", "streaming", "account_access"].includes(
        deliveryMethod,
      )
    ) {
      throwValidationError(
        `CSV row ${input.rowNumber}: details.deliveryMethod is invalid.`,
        { row: input.rowNumber, deliveryMethod },
      );
    }
    return {
      type: "digital_product",
      deliveryMethod: deliveryMethod as
        "download" | "license_key" | "streaming" | "account_access",
      fileFormat: text("details.fileFormat"),
      fileSizeBytes: number("details.fileSizeBytes"),
      version: text("details.version"),
      licenseRequired: boolean("details.licenseRequired") ?? undefined,
      accessDurationDays: number("details.accessDurationDays"),
      fulfillmentUrl: text("details.fulfillmentUrl"),
    };
  }
  if (input.productKind === DatabaseProductKind.SERVICE) {
    const serviceType =
      text("details.serviceType") ??
      String(input.productAttributes.serviceType ?? "").trim();
    const deliveryMode =
      text("details.deliveryMode") ??
      String(input.variantAttributes.mode ?? "").trim();
    const durationMinutes =
      number("details.durationMinutes") ??
      (typeof input.variantAttributes.durationMinutes === "number"
        ? input.variantAttributes.durationMinutes
        : null);
    if (serviceType.length === 0 || deliveryMode.length === 0) {
      throwValidationError(
        `CSV row ${input.rowNumber}: service type and delivery mode are required.`,
        { row: input.rowNumber },
      );
    }
    if (
      !(["in_person", "remote", "hybrid"] as string[]).includes(deliveryMode)
    ) {
      throwValidationError(
        `CSV row ${input.rowNumber}: service delivery mode is invalid.`,
        { row: input.rowNumber, deliveryMode },
      );
    }
    if (durationMinutes === null) {
      throwValidationError(
        `CSV row ${input.rowNumber}: service duration is required.`,
        { row: input.rowNumber },
      );
    }
    return {
      type: "service",
      serviceType,
      deliveryMode: deliveryMode as "in_person" | "remote" | "hybrid",
      durationMinutes,
      location: text("details.location"),
      providerName: text("details.providerName"),
      bookingRequired: boolean("details.bookingRequired") ?? undefined,
    };
  }

  const destination =
    text("details.destination") ??
    String(input.productAttributes.destination ?? "").trim();
  const timezone = text("details.timezone") ?? "Asia/Singapore";
  const date = String(input.variantAttributes.date ?? "").trim();
  const time = String(input.variantAttributes.time ?? "").trim();
  const startsAt =
    text("details.startsAt") ??
    (date.length > 0 && time.length > 0
      ? `${date}T${time.length === 5 ? `${time}:00` : time}+08:00`
      : null);
  if (destination.length === 0 || startsAt === null) {
    throwValidationError(
      `CSV row ${input.rowNumber}: booking destination and start time are required.`,
      { row: input.rowNumber },
    );
  }
  return {
    type: "booking",
    experienceType:
      (text("details.experienceType") ??
        String(input.productAttributes.experienceType ?? "").trim()) ||
      null,
    destination,
    venue: text("details.venue"),
    startsAt,
    endsAt: requireMappedText(
      input.row,
      input.sourcesByTarget,
      "details.endsAt",
      input.rowNumber,
    ),
    timezone,
    capacity: requireMappedNumber(
      input.row,
      input.sourcesByTarget,
      "details.capacity",
      input.rowNumber,
    ),
    minParticipants: number("details.minParticipants") ?? undefined,
    meetingPoint: text("details.meetingPoint"),
  };
}

function stableAttributes(attributes: ProductAttributes): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(attributes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function buildCatalogImportPlan(input: {
  merchantId: string;
  context: CatalogImportContext;
  parsed: ParsedCsv;
  columnMapping: Record<string, string>;
}): PlannedCatalogProduct[] {
  const definitions = attributeImportDefinitions(input.context.attributeSchema);
  const sourcesByTarget = reverseMapping(input.columnMapping);
  const groups = new Map<string, PlannedCatalogProduct>();
  const categorySource = input.parsed.headers.find((header) =>
    ["categoryid", "catalogcategoryid"].includes(normalizedHeader(header)),
  );

  for (const [index, row] of input.parsed.rows.entries()) {
    const rowNumber = index + 2;
    const rowCategory =
      categorySource === undefined ? null : row[categorySource]?.trim();
    if (
      rowCategory !== null &&
      rowCategory !== undefined &&
      rowCategory.length > 0 &&
      rowCategory !== input.context.categoryId
    ) {
      throwValidationError(
        `CSV row ${rowNumber} belongs to ${rowCategory}, not the selected category.`,
        {
          row: rowNumber,
          selectedCategoryId: input.context.categoryId,
          rowCategoryId: rowCategory,
        },
      );
    }
    const productAttributes = readRowAttributes({
      row,
      rowNumber,
      sourcesByTarget,
      definitions,
      scope: "product",
    });
    const variantAttributes = readRowAttributes({
      row,
      rowNumber,
      sourcesByTarget,
      definitions,
      scope: "variant",
    });
    const productName = requireMappedText(
      row,
      sourcesByTarget,
      "product.name",
      rowNumber,
    );
    const productPrice = mappedNumber(
      row,
      sourcesByTarget,
      "product.basePrice",
      rowNumber,
    );
    const variantPrice = mappedNumber(
      row,
      sourcesByTarget,
      "variant.listedPrice",
      rowNumber,
    );
    const basePrice = productPrice ?? variantPrice;
    if (basePrice === null) {
      throwValidationError(
        `CSV row ${rowNumber}: a product or variant price is required.`,
        { row: rowNumber },
      );
    }
    if (basePrice < 0 || (variantPrice !== null && variantPrice < 0)) {
      throwValidationError(`CSV row ${rowNumber}: prices cannot be negative.`, {
        row: rowNumber,
      });
    }
    const currency = mappedText(row, sourcesByTarget, "product.currency");
    if (currency !== null && currency.toUpperCase() !== "SGD") {
      throwValidationError(
        `CSV row ${rowNumber}: only SGD is supported in this prototype.`,
        { row: rowNumber, currency },
      );
    }
    const externalId = mappedText(row, sourcesByTarget, "product.externalId");
    const brand = mappedText(row, sourcesByTarget, "product.brand");
    const groupKey =
      externalId === null
        ? `${productName.toLocaleLowerCase("en")}|${brand?.toLocaleLowerCase("en") ?? ""}|${stableAttributes(productAttributes)}`
        : `external:${externalId}`;
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = {
        input: {
          merchantId: input.merchantId,
          externalId,
          categoryId: input.context.categoryId,
          name: productName,
          description: mappedText(row, sourcesByTarget, "product.description"),
          brand,
          basePrice,
          currency: "SGD",
          imageUrl: mappedText(row, sourcesByTarget, "product.imageUrl"),
          attributes: productAttributes,
          variants: [],
          details: buildRowDetails({
            productKind: input.context.productKind,
            row,
            rowNumber,
            sourcesByTarget,
            productAttributes,
            variantAttributes,
          }),
          active:
            mappedBoolean(row, sourcesByTarget, "product.active", rowNumber) ??
            true,
        },
        inventory: [],
      };
      groups.set(groupKey, group);
    }

    group.input.variants.push({
      externalId: mappedText(row, sourcesByTarget, "variant.externalId"),
      sku: mappedText(row, sourcesByTarget, "variant.sku"),
      name: mappedText(row, sourcesByTarget, "variant.name"),
      attributes: variantAttributes,
      listedPrice: variantPrice ?? basePrice,
      imageUrl: mappedText(row, sourcesByTarget, "variant.imageUrl"),
      active:
        mappedBoolean(row, sourcesByTarget, "variant.active", rowNumber) ??
        true,
    });
    const quantityAvailable =
      mappedNumber(
        row,
        sourcesByTarget,
        "inventory.quantityAvailable",
        rowNumber,
      ) ?? 0;
    const quantityReserved =
      mappedNumber(
        row,
        sourcesByTarget,
        "inventory.quantityReserved",
        rowNumber,
      ) ?? 0;
    if (
      !Number.isInteger(quantityAvailable) ||
      !Number.isInteger(quantityReserved) ||
      quantityAvailable < 0 ||
      quantityReserved < 0 ||
      quantityReserved > quantityAvailable
    ) {
      throwValidationError(
        `CSV row ${rowNumber}: inventory must use non-negative whole numbers and reserved stock cannot exceed total stock.`,
        { row: rowNumber, quantityAvailable, quantityReserved },
      );
    }
    group.inventory.push({ quantityAvailable, quantityReserved });
  }
  const plan = [...groups.values()];
  for (const product of plan) {
    const combinations = new Set<string>();
    for (const variant of product.input.variants) {
      const combination = stableAttributes(variant.attributes);
      if (combinations.has(combination)) {
        throwValidationError(
          `${product.input.name} contains duplicate variant attribute combinations.`,
          { productName: product.input.name, attributes: variant.attributes },
        );
      }
      combinations.add(combination);
    }
  }
  return plan;
}

export async function previewCatalogImport(
  input: PreviewCatalogImportInput,
  dependencies: CommerceDependencies = {},
): Promise<CatalogImportPreview> {
  const [context, parsed] = await Promise.all([
    loadCatalogImportContext(input.merchantId, input.categoryId, dependencies),
    Promise.resolve(parseCsvText(input.csvText)),
  ]);
  let columnMapping: Record<string, string>;
  if (input.columnMapping === undefined) {
    const profiles = await getCommerceDatabase(
      dependencies,
    ).merchantImportProfile.findMany({
      where: {
        merchantId: input.merchantId,
        categoryId: input.categoryId,
        schemaVersion: context.schemaVersion,
        active: true,
      },
      orderBy: { updatedAt: "desc" },
      select: { sourceHeaders: true, columnMapping: true },
    });
    const headerSet = new Set(parsed.headers);
    const savedProfile = profiles.find((profile) => {
      const savedHeaders = stringArray(profile.sourceHeaders);
      return (
        savedHeaders.length === parsed.headers.length &&
        savedHeaders.every((header) => headerSet.has(header))
      );
    });
    columnMapping =
      savedProfile === undefined
        ? suggestImportMapping({
            headers: parsed.headers,
            attributeSchema: context.attributeSchema,
            productKind: context.productKind,
          })
        : stringRecord(savedProfile.columnMapping);
  } else {
    columnMapping = cleanMapping(input.columnMapping);
  }
  const missing = missingRequiredTargets({
    mapping: columnMapping,
    attributeSchema: context.attributeSchema,
    productKind: context.productKind,
  });
  if (missing.length === 0) {
    validateImportMapping({
      sourceHeaders: parsed.headers,
      columnMapping,
      attributeSchema: context.attributeSchema,
      productKind: context.productKind,
    });
    const plan = buildCatalogImportPlan({
      merchantId: input.merchantId,
      context,
      parsed,
      columnMapping,
    });
    await validateImportIdentifiers(input.merchantId, plan, dependencies);
  }
  return {
    categoryId: context.categoryId,
    categoryName: context.categoryName,
    schemaVersion: context.schemaVersion,
    rowCount: parsed.rows.length,
    headers: parsed.headers,
    columnMapping,
    targets: importTargetOptions(
      context.attributeSchema,
      context.productKind,
    ).map(({ target, label, required }) => ({ target, label, required })),
    unmappedHeaders: parsed.headers.filter(
      (header) => columnMapping[header] === undefined,
    ),
    missingRequiredTargets: missing,
    canImport: missing.length === 0,
    sampleRows: parsed.rows.slice(0, 3),
  };
}

function profileName(fileName: string, categoryName: string): string {
  const baseName = fileName.replace(/\.csv$/i, "").trim() || "CSV import";
  return `${baseName} · ${categoryName}`.slice(0, 255);
}

function collectUniqueIdentifiers(
  values: Array<string | null | undefined>,
  label: string,
): string[] {
  const identifiers = values.filter(
    (value): value is string => value !== null && value !== undefined,
  );
  if (new Set(identifiers).size !== identifiers.length) {
    throwValidationError(`CSV contains duplicate ${label} values.`, { label });
  }
  return identifiers;
}

async function validateImportIdentifiers(
  merchantId: string,
  plan: PlannedCatalogProduct[],
  dependencies: CommerceDependencies,
): Promise<void> {
  const productExternalIds = collectUniqueIdentifiers(
    plan.map((product) => product.input.externalId),
    "product external ID",
  );
  const variants = plan.flatMap((product) => product.input.variants);
  const skus = collectUniqueIdentifiers(
    variants.map((variant) => variant.sku),
    "SKU",
  );
  const variantExternalIds = collectUniqueIdentifiers(
    variants.map((variant) => variant.externalId),
    "variant external ID",
  );
  const database = getCommerceDatabase(dependencies);
  const [existingProduct, existingVariant] = await Promise.all([
    productExternalIds.length === 0
      ? null
      : database.product.findFirst({
          where: {
            merchantId,
            externalId: { in: productExternalIds },
          },
          select: { externalId: true },
        }),
    skus.length === 0 && variantExternalIds.length === 0
      ? null
      : database.productVariant.findFirst({
          where: {
            merchantId,
            OR: [
              ...(skus.length === 0 ? [] : [{ sku: { in: skus } }]),
              ...(variantExternalIds.length === 0
                ? []
                : [{ externalId: { in: variantExternalIds } }]),
            ],
          },
          select: { sku: true, externalId: true },
        }),
  ]);
  if (existingProduct !== null) {
    throwValidationError(
      "A product external ID from this CSV already exists for the Merchant.",
      { externalId: existingProduct.externalId },
    );
  }
  if (existingVariant !== null) {
    throwValidationError(
      "A SKU or variant external ID from this CSV already exists for the Merchant.",
      { sku: existingVariant.sku, externalId: existingVariant.externalId },
    );
  }
}

export async function executeCatalogImport(
  input: ExecuteCatalogImportInput,
  dependencies: CommerceDependencies = {},
): Promise<CatalogImportResult> {
  const [context, parsed] = await Promise.all([
    loadCatalogImportContext(input.merchantId, input.categoryId, dependencies),
    Promise.resolve(parseCsvText(input.csvText)),
  ]);
  const columnMapping = cleanMapping(input.columnMapping);
  validateImportMapping({
    sourceHeaders: parsed.headers,
    columnMapping,
    attributeSchema: context.attributeSchema,
    productKind: context.productKind,
  });
  const plan = buildCatalogImportPlan({
    merchantId: input.merchantId,
    context,
    parsed,
    columnMapping,
  });
  await validateImportIdentifiers(input.merchantId, plan, dependencies);
  const createdIds = new Set<string>();
  let importedVariantCount = 0;

  for (const plannedProduct of plan) {
    const created = await createProduct(plannedProduct.input, dependencies);
    createdIds.add(created.productId);
    importedVariantCount += created.variants.length;
    for (const [
      index,
      plannedVariant,
    ] of plannedProduct.input.variants.entries()) {
      const createdVariant = created.variants.find(
        (variant) =>
          stableAttributes(variant.attributes) ===
          stableAttributes(plannedVariant.attributes),
      );
      const inventory = plannedProduct.inventory[index];
      if (createdVariant === undefined || inventory === undefined) {
        throwValidationError(
          "Imported variant inventory could not be matched.",
        );
      }
      await upsertInventory(
        {
          variantId: createdVariant.variantId,
          quantityAvailable: inventory.quantityAvailable,
          quantityReserved: inventory.quantityReserved,
        },
        dependencies,
      );
    }
  }

  const importProfile = await saveImportProfile(
    {
      merchantId: input.merchantId,
      categoryId: context.categoryId,
      name: profileName(input.fileName, context.categoryName),
      schemaVersion: context.schemaVersion,
      sourceHeaders: parsed.headers,
      columnMapping,
    },
    dependencies,
  );
  const products = (
    await listMerchantProducts(input.merchantId, dependencies)
  ).filter((product) => createdIds.has(product.productId));
  return {
    products,
    importedProductCount: plan.length,
    importedVariantCount,
    importProfile,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function safeFileName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "merchant"
  );
}

export async function exportMerchantInventoryCsv(
  merchantId: string,
  dependencies: CommerceDependencies = {},
): Promise<InventoryCsvExport> {
  const products = await listMerchantProducts(merchantId, dependencies);
  const attributeHeaders = new Set<string>();
  const detailHeaders = new Set<string>();
  for (const product of products) {
    Object.keys(product.attributes).forEach((key) =>
      attributeHeaders.add(`product.attributes.${key}`),
    );
    Object.keys(product.details ?? {})
      .filter((key) => key !== "type")
      .forEach((key) => detailHeaders.add(`details.${key}`));
    for (const variant of product.variants) {
      Object.keys(variant.attributes).forEach((key) =>
        attributeHeaders.add(`variant.attributes.${key}`),
      );
    }
  }

  const headers = [
    "category.id",
    "category.name",
    "platform.productId",
    "product.externalId",
    "product.name",
    "product.description",
    "product.brand",
    "product.basePrice",
    "product.currency",
    "product.imageUrl",
    "product.active",
    ...[...attributeHeaders]
      .filter((header) => header.startsWith("product."))
      .sort(),
    ...[...detailHeaders].sort(),
    "platform.variantId",
    "variant.externalId",
    "variant.sku",
    "variant.name",
    "variant.listedPrice",
    "variant.imageUrl",
    "variant.active",
    ...[...attributeHeaders]
      .filter((header) => header.startsWith("variant."))
      .sort(),
    "inventory.quantityAvailable",
    "inventory.quantityReserved",
    "inventory.quantityRemaining",
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const product of products) {
    for (const variant of product.variants) {
      const row: Record<string, unknown> = {
        "category.id": product.categoryId,
        "category.name": product.categoryName,
        "platform.productId": product.productId,
        "product.externalId": product.externalId,
        "product.name": product.name,
        "product.description": product.description,
        "product.brand": product.brand,
        "product.basePrice": product.basePrice,
        "product.currency": product.currency,
        "product.imageUrl": product.imageUrl,
        "product.active": product.active,
        "platform.variantId": variant.variantId,
        "variant.externalId": variant.externalId,
        "variant.sku": variant.sku,
        "variant.name": variant.name,
        "variant.listedPrice": variant.listedPrice,
        "variant.imageUrl": variant.imageUrl,
        "variant.active": variant.active,
        "inventory.quantityAvailable": variant.quantityAvailable,
        "inventory.quantityReserved": variant.quantityReserved,
        "inventory.quantityRemaining": variant.quantityRemaining,
      };
      Object.entries(product.attributes).forEach(([key, value]) => {
        row[`product.attributes.${key}`] = value;
      });
      Object.entries(product.details ?? {})
        .filter(([key]) => key !== "type")
        .forEach(([key, value]) => {
          row[`details.${key}`] =
            value !== null && typeof value === "object"
              ? JSON.stringify(value)
              : value;
        });
      Object.entries(variant.attributes).forEach(([key, value]) => {
        row[`variant.attributes.${key}`] = value;
      });
      rows.push(row);
    }
  }
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(","),
    ),
  ];
  const merchantName = products[0]?.merchantName ?? merchantId;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dependencies.now?.() ?? new Date());
  return {
    fileName: `${safeFileName(merchantName)}-inventory-${date}.csv`,
    content: `\uFEFF${lines.join("\r\n")}\r\n`,
  };
}
