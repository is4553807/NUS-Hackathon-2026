import { RequestOffersRequestSchema } from "@visa-commerce/contracts";
import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createOffersRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/", async (request, reply) => {
      const input = RequestOffersRequestSchema.parse(request.body);
      const result = await services.requestOffers(input);
      return reply.status(201).send(successResponse(result));
    });
  };
}

export const offersRoutes = createOffersRoutes(defaultCommerceApiServices);
