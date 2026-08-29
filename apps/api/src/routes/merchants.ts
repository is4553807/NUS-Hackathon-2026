import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  CreateMerchantBodySchema,
  CreateProductBodySchema,
  MerchantIdParamsSchema,
} from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createMerchantsRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/", async (request, reply) => {
      const input = CreateMerchantBodySchema.parse(request.body);
      const merchant = await services.createMerchant(input);
      return reply.status(201).send(successResponse(merchant));
    });

    app.post("/:merchantId/products", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const input = CreateProductBodySchema.parse(request.body);
      const product = await services.createProduct({ merchantId, ...input });
      return reply.status(201).send(successResponse(product));
    });

    app.get("/:merchantId/products", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const products = await services.listMerchantProducts(merchantId);
      return reply.send(successResponse({ products }));
    });
  };
}

export const merchantsRoutes = createMerchantsRoutes(
  defaultCommerceApiServices,
);
