import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  ProductIdParamsSchema,
  UpdateProductBodySchema,
} from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createProductsRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.get("/:productId", async (request, reply) => {
      const { productId } = ProductIdParamsSchema.parse(request.params);
      const product = await services.getPublicProduct(productId);
      return reply.send(successResponse(product));
    });

    app.patch("/:productId", async (request, reply) => {
      const { productId } = ProductIdParamsSchema.parse(request.params);
      const input = UpdateProductBodySchema.parse(request.body);
      const product = await services.updateProduct(productId, input);
      return reply.send(successResponse(product));
    });
  };
}

export const productsRoutes = createProductsRoutes(defaultCommerceApiServices);
