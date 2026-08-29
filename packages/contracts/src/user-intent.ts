import { z } from "zod";

import {
  CurrencyCodeSchema,
  MoneySchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";

export const PRODUCT_CATEGORIES = [
  "physical_goods",
  "digital_products",
  "services",
  "bookings_experiences",
] as const;

export const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);

export const UserIntentSchema = z.object({
  intentId: UuidSchema,
  category: ProductCategorySchema,
  budgetMax: MoneySchema.positive(),
  currency: CurrencyCodeSchema,
  quantity: z.number().int().min(1),
  brandPreferences: z.array(z.string().trim().min(1)),
  productAttributes: ProductAttributesSchema,
  deliveryLocation: z.string().trim().min(1).nullable(),
  deliveryDeadline: TimestampSchema.nullable(),
});

export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type UserIntent = z.infer<typeof UserIntentSchema>;
