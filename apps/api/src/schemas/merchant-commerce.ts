import type { JsonObject, JsonValue } from "@visa-commerce/commerce";
import {
  CurrencyCodeSchema,
  ProductCategorySchema,
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

export const InventoryParamsSchema = z
  .object({
    productId: UuidSchema,
    variantKey: z.string().trim().min(1),
  })
  .strict();

export const CreateMerchantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    category: ProductCategorySchema.nullable().optional(),
    description: NullableTextSchema,
    currency: CurrencyCodeSchema.optional(),
    contactEmail: z.string().email().nullable().optional(),
  })
  .strict();

const ProductBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: NullableTextSchema,
  brand: NullableTextSchema,
  listedPrice: z.number().finite().nonnegative(),
  currency: CurrencyCodeSchema.optional(),
  imageUrl: NullableUrlSchema,
  active: z.boolean().optional(),
});

const PhysicalGoodDetailsSchema = z
  .object({
    sku: NullableTextSchema,
    sizeOptions: z.array(z.string().trim().min(1)).optional(),
    colorOptions: z.array(z.string().trim().min(1)).optional(),
    material: NullableTextSchema,
    weightGrams: z.number().int().nonnegative().nullable().optional(),
    lengthCm: z.number().finite().nonnegative().nullable().optional(),
    widthCm: z.number().finite().nonnegative().nullable().optional(),
    heightCm: z.number().finite().nonnegative().nullable().optional(),
    shippingRequired: z.boolean().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

const DigitalProductDetailsSchema = z
  .object({
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
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

const ServiceDetailsSchema = z
  .object({
    serviceType: z.string().trim().min(1).max(150),
    deliveryMode: z.enum(["in_person", "remote", "hybrid"]),
    durationMinutes: z.number().int().positive(),
    location: NullableTextSchema,
    serviceAreas: z.array(z.string().trim().min(1)).optional(),
    providerName: NullableTextSchema,
    bookingRequired: z.boolean().optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

const BookingExperienceDetailsSchema = z
  .object({
    experienceType: NullableTextSchema,
    destination: z.string().trim().min(1).max(255),
    venue: NullableTextSchema,
    startsAt: TimestampSchema,
    endsAt: TimestampSchema,
    timezone: z.string().trim().min(1).max(100).optional(),
    capacity: z.number().int().positive(),
    minParticipants: z.number().int().positive().optional(),
    meetingPoint: NullableTextSchema,
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

export const CreateProductBodySchema = z.discriminatedUnion("category", [
  ProductBaseSchema.extend({
    category: z.literal("physical_goods"),
    details: PhysicalGoodDetailsSchema,
  }).strict(),
  ProductBaseSchema.extend({
    category: z.literal("digital_products"),
    details: DigitalProductDetailsSchema,
  }).strict(),
  ProductBaseSchema.extend({
    category: z.literal("services"),
    details: ServiceDetailsSchema,
  }).strict(),
  ProductBaseSchema.extend({
    category: z.literal("bookings_experiences"),
    details: BookingExperienceDetailsSchema,
  }).strict(),
]);

export const UpdateProductBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: NullableTextSchema,
    brand: NullableTextSchema,
    listedPrice: z.number().finite().nonnegative().optional(),
    imageUrl: NullableUrlSchema,
    active: z.boolean().optional(),
  })
  .strict();

export const UpsertInventoryBodySchema = z
  .object({
    quantityAvailable: z.number().int().nonnegative(),
    quantityReserved: z.number().int().nonnegative().optional(),
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
