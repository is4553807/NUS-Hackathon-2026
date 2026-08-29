import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  CreateMerchantBodySchema,
  CreateProductBodySchema,
  MerchantIdParamsSchema,
  SaveImportProfileBodySchema,
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

    app.post("/:merchantId/import-profiles", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const input = SaveImportProfileBodySchema.parse(request.body);
      const profile = await services.saveImportProfile({
        merchantId,
        ...input,
      });
      return reply.status(201).send(successResponse(profile));
    });

    app.get("/:merchantId/import-profiles", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const profiles = await services.listImportProfiles(merchantId);
      return reply.send(successResponse({ profiles }));
    });
  };
}

export const merchantsRoutes = createMerchantsRoutes(
  defaultCommerceApiServices,
);
