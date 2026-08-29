import { z } from "zod";

export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });
export const CurrencyCodeSchema = z.literal("SGD");
export const MoneySchema = z.number().finite().nonnegative();
export const CategoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "categoryId must be a canonical lowercase taxonomy path",
  );

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
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type ProductAttributeValue = z.infer<typeof ProductAttributeValueSchema>;
export type ProductAttributes = z.infer<typeof ProductAttributesSchema>;
