import { z } from "zod";

import {
  CategoryIdSchema,
  CurrencyCodeSchema,
  MoneySchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";

export const COMMERCE_DOMAINS = [
  "retail_goods",
  "services_subscriptions",
  "bookings",
] as const;

export const CommerceDomainSchema = z.enum(COMMERCE_DOMAINS);

export const UserIntentSchema = z.object({
  intentId: UuidSchema,
  query: z.string().trim().min(1),
  commerceDomain: CommerceDomainSchema,
  categoryId: CategoryIdSchema.nullable(),
  budgetMax: MoneySchema.positive(),
  currency: CurrencyCodeSchema,
  quantity: z.number().int().min(1),
  brandPreferences: z.array(z.string().trim().min(1)),
  productAttributes: ProductAttributesSchema,
  deliveryLocation: z.string().trim().min(1).nullable(),
  deliveryDeadline: TimestampSchema.nullable(),
});

export type CommerceDomain = z.infer<typeof CommerceDomainSchema>;
export type UserIntent = z.infer<typeof UserIntentSchema>;
