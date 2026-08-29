import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCheckInventoryTool } from "./tools/check-inventory.js";
import { registerCreateOrderTool } from "./tools/create-order.js";
import { registerGetPaymentStatusTool } from "./tools/get-payment-status.js";
import { registerGetProductTool } from "./tools/get-product.js";
import { registerInitiatePaymentTool } from "./tools/initiate-payment.js";
import { registerRequestOffersTool } from "./tools/request-offers.js";
import { registerSearchProductsTool } from "./tools/search-products.js";

export function registerTools(server: McpServer): void {
  registerSearchProductsTool(server);
  registerGetProductTool(server);
  registerCheckInventoryTool(server);
  registerRequestOffersTool(server);
  registerCreateOrderTool(server);
  registerInitiatePaymentTool(server);
  registerGetPaymentStatusTool(server);
}
