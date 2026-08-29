import { z } from "zod";

import {
  CurrencyCodeSchema,
  MoneySchema,
  TimestampSchema,
  UuidSchema,
} from "./common.js";

export const PaymentStatusSchema = z.enum([
  "pending",
  "requires_verification",
  "authorized",
  "declined",
  "failed",
  "cancelled",
]);

export const PaymentResultSchema = z
  .object({
    orderId: UuidSchema,
    paymentId: UuidSchema,
    provider: z.literal("Visa"),
    status: PaymentStatusSchema,
    amount: MoneySchema,
    currency: CurrencyCodeSchema,
    cardholderVerified: z.boolean(),
    authorizationReference: z.string().trim().min(1).nullable(),
    failureCode: z.string().trim().min(1).nullable(),
    failureMessage: z.string().trim().min(1).nullable(),
    updatedAt: TimestampSchema,
  })
  .superRefine((payment, context) => {
    if (
      payment.status === "authorized" &&
      payment.authorizationReference === null
    ) {
      context.addIssue({
        code: "custom",
        message: "An authorized payment requires an authorizationReference",
        path: ["authorizationReference"],
      });
    }

    if (
      payment.status !== "authorized" &&
      payment.authorizationReference !== null
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An unsuccessful payment cannot have an authorizationReference",
        path: ["authorizationReference"],
      });
    }

    if (
      payment.status === "authorized" &&
      (!payment.cardholderVerified ||
        payment.failureCode !== null ||
        payment.failureMessage !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An authorized payment must be verified and cannot contain failure fields",
        path: ["status"],
      });
    }

    if (
      ["declined", "failed"].includes(payment.status) &&
      (payment.failureCode === null || payment.failureMessage === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A declined or failed payment requires safe failure details",
        path: ["failureCode"],
      });
    }
  });

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type PaymentResult = z.infer<typeof PaymentResultSchema>;
