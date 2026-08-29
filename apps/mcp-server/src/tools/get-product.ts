import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CategoryIdSchema,
  CommerceDomainSchema,
  CurrencyCodeSchema,
  GetProductRequestSchema,
  MoneySchema,
  ProductAttributesSchema,
  UuidSchema,
} from "@visa-commerce/contracts";
import { z } from "zod";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

const PublicProductSchema = z.object({
  productId: UuidSchema,
  merchantId: UuidSchema,
  merchantName: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  description: z.string().nullable(),
  brand: z.string().nullable(),
  commerceDomain: CommerceDomainSchema,
  categoryId: CategoryIdSchema,
  categoryName: z.string().trim().min(1),
  basePrice: MoneySchema,
  currency: CurrencyCodeSchema,
  imageUrl: z.url().nullable(),
  attributes: ProductAttributesSchema,
  variants: z.array(
    z.object({
      variantId: UuidSchema,
      sku: z.string().nullable(),
      name: z.string().nullable(),
      attributes: ProductAttributesSchema,
      listedPrice: MoneySchema,
      quantityAvailable: z.number().int().nonnegative(),
    }),
  ),
});

export function registerGetProductTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "get_product",
    {
      title: "Get public product details",
      description:
        "Read one active product and its public variants. Private minimum prices, pricing policies, payment credentials, and merchant-only fields are never returned.",
      inputSchema: GetProductRequestSchema,
      outputSchema: PublicProductSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ productId }) =>
      executeCommerceTool(() => services.getPublicProduct(productId)),
  );
}
