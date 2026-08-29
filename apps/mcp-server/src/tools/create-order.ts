import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateOrderRequestSchema,
  OrderResultSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerCreateOrderTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "create_order",
    {
      title: "Create a confirmed order",
      description:
        "Create an idempotent order from one active offer only after transaction-specific user confirmation. The Commerce backend revalidates offer expiry, price, inventory, and delivery before reserving stock.",
      inputSchema: CreateOrderRequestSchema,
      outputSchema: OrderResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => executeCommerceTool(() => services.createOrder(input)),
  );
}
