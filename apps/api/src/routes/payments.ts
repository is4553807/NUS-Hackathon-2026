import {
  GetPaymentStatusRequestSchema,
  InitiatePaymentRequestSchema,
} from "@visa-commerce/contracts";
import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createPaymentsRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/", async (request, reply) => {
      const input = InitiatePaymentRequestSchema.parse(request.body);
      const payment = await services.initiatePayment(input);
      return reply.status(201).send(successResponse(payment));
    });

    app.get("/:paymentId", async (request, reply) => {
      const { paymentId } = GetPaymentStatusRequestSchema.parse(request.params);
      const payment = await services.getPaymentStatus(paymentId);
      return reply.send(successResponse(payment));
    });
  };
}

export const paymentsRoutes = createPaymentsRoutes(defaultCommerceApiServices);
