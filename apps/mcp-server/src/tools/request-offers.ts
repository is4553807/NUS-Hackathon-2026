import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RequestOffersDataSchema,
  RequestOffersRequestSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerRequestOffersTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "request_offers",
    {
      title: "Request purchasable offers",
      description:
        "Validate product fit, live inventory, delivery, merchant policy, and the user's budget, then create time-limited purchasable offers. An empty offers array is a valid result.",
      inputSchema: RequestOffersRequestSchema,
      outputSchema: RequestOffersDataSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => executeCommerceTool(() => services.requestOffers(input)),
  );
}
