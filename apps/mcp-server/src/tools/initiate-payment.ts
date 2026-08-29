import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  InitiatePaymentRequestSchema,
  PaymentResultSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerInitiatePaymentTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "initiate_payment",
    {
      title: "Initiate saved Visa payment",
      description:
        "Start an idempotent mock Visa payment for a confirmed order using the user's default or selected saved paymentMethodId. Amount and currency come from the order. Never provide PAN, CVV, or a provider credential.",
      inputSchema: InitiatePaymentRequestSchema,
      outputSchema: PaymentResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => executeCommerceTool(() => services.initiatePayment(input)),
  );
}
