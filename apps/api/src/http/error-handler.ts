import { CommerceError } from "@visa-commerce/commerce";
import type { ErrorCode } from "@visa-commerce/contracts";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { errorResponse } from "./responses.js";

const statusByCode: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  OFFER_EXPIRED: 409,
  OUT_OF_STOCK: 409,
  DELIVERY_UNAVAILABLE: 409,
  PRICE_CHANGED: 409,
  CONFIRMATION_REQUIRED: 409,
  ORDER_CONFLICT: 409,
  IDENTITY_VERIFICATION_REQUIRED: 403,
  PAYMENT_DECLINED: 402,
  PAYMENT_FAILED: 502,
};

export function registerApiErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(
        errorResponse({
          code: "VALIDATION_ERROR",
          message: "The request payload is invalid.",
          details: { issues: error.issues },
        }),
      );
    }

    if (error instanceof CommerceError) {
      return reply.status(statusByCode[error.code] ?? 400).send(
        errorResponse({
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details,
        }),
      );
    }

    request.log.error({ err: error }, "Unhandled API error");
    return reply.status(500).send(
      errorResponse({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        retryable: false,
      }),
    );
  });
}
