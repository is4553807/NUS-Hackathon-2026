import { CheckInventoryRequestSchema } from "@visa-commerce/contracts";
import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  UpsertInventoryBodySchema,
  UpdateProductVariantBodySchema,
  VariantIdParamsSchema,
} from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createInventoryRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.patch("/:variantId", async (request, reply) => {
      const { variantId } = VariantIdParamsSchema.parse(request.params);
      const input = UpdateProductVariantBodySchema.parse(request.body);
      const variant = await services.updateProductVariant(variantId, input);
      return reply.send(successResponse(variant));
    });

    app.put("/:variantId/inventory", async (request, reply) => {
      const { variantId } = VariantIdParamsSchema.parse(request.params);
      const input = UpsertInventoryBodySchema.parse(request.body);
      const inventory = await services.upsertInventory({
        variantId,
        ...input,
      });
      return reply.send(successResponse(inventory));
    });
  };
}

export const inventoryRoutes = createInventoryRoutes(
  defaultCommerceApiServices,
);

export function createInventoryCheckRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.post("/check", async (request, reply) => {
      const input = CheckInventoryRequestSchema.parse(request.body);
      const inventory = await services.checkInventory(input);
      return reply.send(successResponse(inventory));
    });
  };
}

export const inventoryCheckRoutes = createInventoryCheckRoutes(
  defaultCommerceApiServices,
);
