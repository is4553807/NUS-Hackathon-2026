import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SearchProductsDataSchema,
  SearchProductsRequestSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerSearchProductsTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "search_products",
    {
      title: "Search commerce products",
      description:
        "Search the active canonical merchant catalog using a complete UserIntent. Results are discovery candidates only; call request_offers for a transaction-ready price.",
      inputSchema: SearchProductsRequestSchema,
      outputSchema: SearchProductsDataSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => executeCommerceTool(() => services.searchProducts(input)),
  );
}
