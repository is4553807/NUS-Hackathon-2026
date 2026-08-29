import { SearchProductsRequestSchema } from "@visa-commerce/contracts";
import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createSearchRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/", async (request, reply) => {
      const input = SearchProductsRequestSchema.parse(request.body);
      const result = await services.searchProducts(input);
      return reply.send(successResponse(result));
    });
  };
}

export const searchRoutes = createSearchRoutes(defaultCommerceApiServices);
