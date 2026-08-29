import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CheckInventoryDataSchema,
  CheckInventoryRequestSchema,
} from "@visa-commerce/contracts";

import type { CommerceMcpServices } from "../services.js";
import { executeCommerceTool } from "../tool-result.js";

export function registerCheckInventoryTool(
  server: McpServer,
  services: CommerceMcpServices,
): void {
  server.registerTool(
    "check_inventory",
    {
      title: "Check live inventory",
      description:
        "Check whether the canonical attributes identify an active variant with enough currently available inventory for the requested quantity.",
      inputSchema: CheckInventoryRequestSchema,
      outputSchema: CheckInventoryDataSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => executeCommerceTool(() => services.checkInventory(input)),
  );
}
