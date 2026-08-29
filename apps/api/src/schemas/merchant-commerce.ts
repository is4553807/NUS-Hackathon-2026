import type { JsonObject, JsonValue } from "@visa-commerce/commerce";
import {
  CategoryIdSchema,
  CurrencyCodeSchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "@visa-commerce/contracts";
import { z } from "zod";

const NullableTextSchema = z.string().trim().min(1).nullable().optional();
const NullableUrlSchema = z.string().url().nullable().optional();

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const JsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  JsonValueSchema,
);

export const MerchantIdParamsSchema = z
  .object({ merchantId: UuidSchema })
  .strict();

export const ProductIdParamsSchema = z
  .object({ productId: UuidSchema })
  .strict();

export const VariantIdParamsSchema = z
  .object({ variantId: UuidSchema })
  .strict();

export const CategoryIdParamsSchema = z
  .object({ categoryId: CategoryIdSchema })
  .strict();

export const CreateMerchantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    category: CategoryIdSchema.nullable().optional(),
    description: NullableTextSchema,
    currency: CurrencyCodeSchema.optional(),
    contactEmail: z.string().email().nullable().optional(),
  })
  .strict();

const ProductVariantSchema = z
  .object({
    externalId: NullableTextSchema,
    sku: NullableTextSchema,
    name: NullableTextSchema,
    attributes: ProductAttributesSchema,
    listedPrice: z.number().finite().nonnegative().optional(),
    imageUrl: NullableUrlSchema,
    active: z.boolean().optional(),
  })
  .strict();

const PhysicalGoodDetailsSchema = z
  .object({
    type: z.literal("physical_good"),
    weightGrams: z.number().int().nonnegative().nullable().optional(),
    lengthCm: z.number().finite().nonnegative().nullable().optional(),
    widthCm: z.number().finite().nonnegative().nullable().optional(),
    heightCm: z.number().finite().nonnegative().nullable().optional(),
    shippingRequired: z.boolean().optional(),
  })
  .strict();

const DigitalProductDetailsSchema = z
  .object({
    type: z.literal("digital_product"),
    deliveryMethod: z.enum([
      "download",
      "license_key",
      "streaming",
      "account_access",
    ]),
    fileFormat: NullableTextSchema,
    fileSizeBytes: z.number().int().nonnegative().nullable().optional(),
    version: NullableTextSchema,
    licenseRequired: z.boolean().optional(),
    accessDurationDays: z.number().int().positive().nullable().optional(),
    fulfillmentUrl: NullableUrlSchema,
  })
  .strict();

const ServiceDetailsSchema = z
  .object({
    type: z.literal("service"),
    serviceType: z.string().trim().min(1).max(150),
    deliveryMode: z.enum(["in_person", "remote", "hybrid"]),
    durationMinutes: z.number().int().positive(),
    location: NullableTextSchema,
    serviceAreas: z.array(z.string().trim().min(1)).optional(),
    providerName: NullableTextSchema,
    bookingRequired: z.boolean().optional(),
  })
  .strict();

const BookingExperienceDetailsSchema = z
  .object({
    type: z.literal("booking"),
    experienceType: NullableTextSchema,
    destination: z.string().trim().min(1).max(255),
    venue: NullableTextSchema,
    startsAt: TimestampSchema,
    endsAt: TimestampSchema,
    timezone: z.string().trim().min(1).max(100).optional(),
    capacity: z.number().int().positive(),
    minParticipants: z.number().int().positive().optional(),
    meetingPoint: NullableTextSchema,
  })
  .strict();

export const CreateProductBodySchema = z
  .object({
    externalId: NullableTextSchema,
    categoryId: CategoryIdSchema,
    billingModel: z
      .enum(["one_time", "recurring", "usage_based", "deposit"])
      .optional(),
    availabilityModel: z
      .enum(["stock", "unlimited", "time_slot", "capacity", "seat"])
      .optional(),
    name: z.string().trim().min(1).max(255),
    description: NullableTextSchema,
    brand: NullableTextSchema,
    basePrice: z.number().finite().nonnegative(),
    currency: CurrencyCodeSchema.optional(),
    imageUrl: NullableUrlSchema,
    attributes: ProductAttributesSchema,
    variants: z.array(ProductVariantSchema).min(1),
    details: z.discriminatedUnion("type", [
      PhysicalGoodDetailsSchema,
      DigitalProductDetailsSchema,
      ServiceDetailsSchema,
      BookingExperienceDetailsSchema,
    ]),
    active: z.boolean().optional(),
  })
  .strict();

export const UpdateProductBodySchema = z
  .object({
    externalId: NullableTextSchema,
    name: z.string().trim().min(1).max(255).optional(),
    description: NullableTextSchema,
    brand: NullableTextSchema,
    basePrice: z.number().finite().nonnegative().optional(),
    imageUrl: NullableUrlSchema,
    attributes: ProductAttributesSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const UpsertInventoryBodySchema = z
  .object({
    quantityAvailable: z.number().int().nonnegative(),
    quantityReserved: z.number().int().nonnegative().optional(),
  })
  .strict();

export const UpdateProductVariantBodySchema = z
  .object({
    externalId: NullableTextSchema,
    sku: NullableTextSchema,
    name: NullableTextSchema,
    attributes: ProductAttributesSchema.optional(),
    listedPrice: z.number().finite().nonnegative().optional(),
    imageUrl: NullableUrlSchema,
    active: z.boolean().optional(),
  })
  .strict();

export const ConfigurePricingPolicyBodySchema = z
  .object({
    negotiationEnabled: z.boolean(),
    minimumPrice: z.number().finite().nonnegative().nullable().optional(),
    maxDiscountPercent: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .nullable()
      .optional(),
    inventoryDiscountEnabled: z.boolean().optional(),
    rules: JsonObjectSchema.optional(),
  })
  .strict();

export const SaveImportProfileBodySchema = z
  .object({
    categoryId: CategoryIdSchema,
    name: z.string().trim().min(1).max(255),
    schemaVersion: z.string().trim().min(1).max(30),
    sourceHeaders: z.array(z.string().trim().min(1)).min(1),
    columnMapping: z.record(z.string().trim().min(1), z.string().trim().min(1)),
    normalizationRules: JsonObjectSchema.nullable().optional(),
  })
  .strict();

const CatalogCsvBodyFields = {
  categoryId: CategoryIdSchema,
  fileName: z.string().trim().min(1).max(255),
  csvText: z.string().min(1).max(1_000_000),
  columnMapping: z
    .record(z.string().trim().min(1), z.string().trim().min(1))
    .optional(),
};

export const PreviewCatalogImportBodySchema = z
  .object(CatalogCsvBodyFields)
  .strict();

export const ExecuteCatalogImportBodySchema = z
  .object({
    ...CatalogCsvBodyFields,
    columnMapping: z.record(z.string().trim().min(1), z.string().trim().min(1)),
  })
  .strict();
