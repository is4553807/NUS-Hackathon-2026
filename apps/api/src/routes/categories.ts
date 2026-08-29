import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import { CategoryIdParamsSchema } from "../schemas/merchant-commerce.js";
import {
  defaultCommerceApiServices,
  type CommerceApiServices,
} from "../services.js";

export function createCategoriesRoutes(
  services: CommerceApiServices,
): FastifyPluginAsync {
  return async (app) => {
    app.get("/", async () => {
      const categories = await services.listCategories();
      return successResponse({ categories });
    });

    app.get("/:categoryId/schema", async (request) => {
      const { categoryId } = CategoryIdParamsSchema.parse(request.params);
      const schema = await services.getCategorySchema(categoryId);
      return successResponse(schema);
    });
  };
}

export const categoriesRoutes = createCategoriesRoutes(
  defaultCommerceApiServices,
);
