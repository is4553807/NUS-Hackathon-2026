import { z } from "zod";

import {
  CategoryIdSchema,
  CurrencyCodeSchema,
  MoneySchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";
import { CommerceDomainSchema } from "./user-intent.js";

export const OfferStatusSchema = z.enum([
  "active",
  "expired",
  "accepted",
  "cancelled",
]);

export const OfferSchema = z
  .object({
    offerId: UuidSchema,
    intentId: UuidSchema,
    merchantId: UuidSchema,
    merchantName: z.string().trim().min(1),
    productId: UuidSchema,
    productName: z.string().trim().min(1),
    variantId: UuidSchema,
    commerceDomain: CommerceDomainSchema,
    categoryId: CategoryIdSchema,
    listedPrice: MoneySchema,
    offeredPrice: MoneySchema,
    currency: CurrencyCodeSchema,
    quantity: z.number().int().min(1),
    quantityAvailable: z.number().int().nonnegative(),
    attributes: ProductAttributesSchema,
    deliveryAvailable: z.boolean(),
    deliveryEstimate: TimestampSchema.nullable(),
    status: OfferStatusSchema,
    expiresAt: TimestampSchema,
    priceExplanation: z.string().trim().min(1),
  })
  .superRefine((offer, context) => {
    if (offer.offeredPrice > offer.listedPrice) {
      context.addIssue({
        code: "custom",
        message: "offeredPrice must not exceed listedPrice",
        path: ["offeredPrice"],
      });
    }

    if (offer.quantityAvailable < offer.quantity) {
      context.addIssue({
        code: "custom",
        message: "quantityAvailable must cover the offered quantity",
        path: ["quantityAvailable"],
      });
    }
  });

export type OfferStatus = z.infer<typeof OfferStatusSchema>;
export type Offer = z.infer<typeof OfferSchema>;
