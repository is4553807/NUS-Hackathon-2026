import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetPaymentStatusRequestSchema,
  PaymentResultSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerGetPaymentStatusTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "get_payment_status",
    {
      title: "Get payment status",
      description:
        "Read the latest safe PaymentResult for one payment. Provider credentials, raw card data, and gateway secrets are never returned.",
      inputSchema: GetPaymentStatusRequestSchema,
      outputSchema: PaymentResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ paymentId }) =>
      executeCommerceTool(() => services.getPaymentStatus(paymentId)),
  );
}
