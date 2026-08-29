import { z } from "zod";

import {
  CurrencyCodeSchema,
  MoneySchema,
  ProductAttributesSchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";
import { OfferSchema } from "./offer.js";
import { OrderRequestSchema } from "./order-request.js";
import { PaymentResultSchema } from "./payment-result.js";
import { UserIntentSchema } from "./user-intent.js";

export const SearchProductsRequestSchema = z.object({
  intent: UserIntentSchema,
});

export const ProductSearchResultSchema = z.object({
  productId: UuidSchema,
  merchantId: UuidSchema,
  merchantName: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  brand: z.string().trim().min(1).nullable(),
  category: z.string().trim().min(1),
  listedPrice: MoneySchema,
  currency: CurrencyCodeSchema,
  matchedAttributes: ProductAttributesSchema,
});

export const SearchProductsDataSchema = z.object({
  products: z.array(ProductSearchResultSchema),
});

export const GetProductRequestSchema = z.object({
  productId: UuidSchema,
});

export const CheckInventoryRequestSchema = z.object({
  productId: UuidSchema,
  attributes: ProductAttributesSchema,
  quantity: z.number().int().min(1),
});

export const CheckInventoryDataSchema = z.object({
  available: z.boolean(),
  quantityAvailable: z.number().int().nonnegative(),
  variantKey: z.string().trim().min(1),
  checkedAt: TimestampSchema,
});

export const RequestOffersRequestSchema = z.object({
  intent: UserIntentSchema,
});

export const RequestOffersDataSchema = z.object({
  offers: z.array(OfferSchema),
});

export const OrderStatusSchema = z.enum([
  "payment_pending",
  "paid",
  "payment_failed",
  "cancelled",
]);

export const OrderResultSchema = z.object({
  orderId: UuidSchema,
  offerId: UuidSchema,
  userId: UuidSchema,
  merchantId: UuidSchema,
  productId: UuidSchema,
  quantity: z.number().int().min(1),
  unitPrice: MoneySchema,
  totalAmount: MoneySchema,
  currency: CurrencyCodeSchema,
  userConfirmed: z.literal(true),
  status: OrderStatusSchema,
  createdAt: TimestampSchema,
});

export const CreateOrderRequestSchema = OrderRequestSchema;

export const InitiatePaymentRequestSchema = z.object({
  requestId: UuidSchema,
  orderId: UuidSchema,
  paymentMethod: z.literal("mock_visa"),
  mockPaymentToken: z.string().trim().min(1),
});

export const GetPaymentStatusRequestSchema = z.object({
  paymentId: UuidSchema,
});

export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "OFFER_EXPIRED",
  "OUT_OF_STOCK",
  "DELIVERY_UNAVAILABLE",
  "PRICE_CHANGED",
  "CONFIRMATION_REQUIRED",
  "ORDER_CONFLICT",
  "IDENTITY_VERIFICATION_REQUIRED",
  "PAYMENT_DECLINED",
  "PAYMENT_FAILED",
  "INTERNAL_ERROR",
]);

export const ResponseMetaSchema = z.object({
  requestId: UuidSchema,
  timestamp: TimestampSchema,
});

export const createSuccessResponseSchema = <T extends z.ZodType>(
  dataSchema: T,
) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ResponseMetaSchema,
  });

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().trim().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()),
  }),
  meta: ResponseMetaSchema,
});

export const PaymentResultResponseSchema =
  createSuccessResponseSchema(PaymentResultSchema);

export type SearchProductsRequest = z.infer<typeof SearchProductsRequestSchema>;
export type ProductSearchResult = z.infer<typeof ProductSearchResultSchema>;
export type SearchProductsData = z.infer<typeof SearchProductsDataSchema>;
export type GetProductRequest = z.infer<typeof GetProductRequestSchema>;
export type CheckInventoryRequest = z.infer<typeof CheckInventoryRequestSchema>;
export type CheckInventoryData = z.infer<typeof CheckInventoryDataSchema>;
export type RequestOffersRequest = z.infer<typeof RequestOffersRequestSchema>;
export type RequestOffersData = z.infer<typeof RequestOffersDataSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderResult = z.infer<typeof OrderResultSchema>;
export type InitiatePaymentRequest = z.infer<
  typeof InitiatePaymentRequestSchema
>;
export type GetPaymentStatusRequest = z.infer<
  typeof GetPaymentStatusRequestSchema
>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type SuccessResponse<T> = {
  success: true;
  data: T;
  meta: z.infer<typeof ResponseMetaSchema>;
};
