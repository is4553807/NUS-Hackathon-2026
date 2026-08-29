import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  ConfigurePricingPolicyBodySchema,
  ProductIdParamsSchema,
} from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createPricingRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.put("/:productId/pricing-policy", async (request, reply) => {
      const { productId } = ProductIdParamsSchema.parse(request.params);
      const input = ConfigurePricingPolicyBodySchema.parse(request.body);
      const policy = await services.configurePricingPolicy({
        productId,
        ...input,
      });
      return reply.send(successResponse(policy));
    });
  };
}

export const pricingRoutes = createPricingRoutes(defaultCommerceApiServices);
