import type { FastifyPluginAsync } from "fastify";

import { successResponse } from "../http/responses.js";
import {
  CreateMerchantBodySchema,
  CreateProductBodySchema,
  ExecuteCatalogImportBodySchema,
  MerchantIdParamsSchema,
  PreviewCatalogImportBodySchema,
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
    app.get("/", async (_request, reply) => {
      const merchants = await services.listMerchants();
      return reply.send(successResponse({ merchants }));
    });

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

    app.get("/:merchantId/inventory.csv", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const exported = await services.exportMerchantInventoryCsv(merchantId);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${exported.fileName}"`,
        )
        .send(exported.content);
    });

    app.post("/:merchantId/catalog-imports/preview", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const input = PreviewCatalogImportBodySchema.parse(request.body);
      const preview = await services.previewCatalogImport({
        merchantId,
        ...input,
      });
      return reply.send(successResponse(preview));
    });

    app.post("/:merchantId/catalog-imports", async (request, reply) => {
      const { merchantId } = MerchantIdParamsSchema.parse(request.params);
      const input = ExecuteCatalogImportBodySchema.parse(request.body);
      const result = await services.executeCatalogImport({
        merchantId,
        ...input,
      });
      return reply.status(201).send(successResponse(result));
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
