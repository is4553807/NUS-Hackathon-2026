import { z } from "zod";

import {
  CurrencyCodeSchema,
  MoneySchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";

export const UserIntentSchema = z.object({
  intentId: UuidSchema,
  category: z.string().trim().min(1),
  budgetMax: MoneySchema.positive(),
  currency: CurrencyCodeSchema,
  quantity: z.number().int().min(1),
  brandPreferences: z.array(z.string().trim().min(1)),
  productAttributes: ProductAttributesSchema,
  deliveryLocation: z.string().trim().min(1).nullable(),
  deliveryDeadline: TimestampSchema.nullable(),
});

export type UserIntent = z.infer<typeof UserIntentSchema>;
