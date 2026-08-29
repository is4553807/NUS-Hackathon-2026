import { z } from "zod";

export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });
export const CurrencyCodeSchema = z.literal("SGD");
export const MoneySchema = z.number().finite().nonnegative();

export const ProductAttributeValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

export const ProductAttributesSchema = z.record(
  z.string(),
  ProductAttributeValueSchema,
);

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type ProductAttributeValue = z.infer<typeof ProductAttributeValueSchema>;
export type ProductAttributes = z.infer<typeof ProductAttributesSchema>;
