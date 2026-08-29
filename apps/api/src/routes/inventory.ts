import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  InventoryParamsSchema,
  UpsertInventoryBodySchema,
} from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createInventoryRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.put("/:productId/inventory/:variantKey", async (request, reply) => {
      const { productId, variantKey } = InventoryParamsSchema.parse(
        request.params,
      );
      const input = UpsertInventoryBodySchema.parse(request.body);
      const inventory = await services.upsertInventory({
        productId,
        variantKey,
        ...input,
      });
      return reply.send(successResponse(inventory));
    });
  };
}

export const inventoryRoutes = createInventoryRoutes(
  defaultCommerceApiServices,
);
