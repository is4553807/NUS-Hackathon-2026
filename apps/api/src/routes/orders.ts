import { CreateOrderRequestSchema } from "@visa-commerce/contracts";
import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createOrdersRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/", async (request, reply) => {
      const input = CreateOrderRequestSchema.parse(request.body);
      const order = await services.createOrder(input);
      return reply.status(201).send(successResponse(order));
    });
  };
}

export const ordersRoutes = createOrdersRoutes(defaultCommerceApiServices);
