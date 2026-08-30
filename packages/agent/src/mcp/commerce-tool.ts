import type { Tool } from "openai/resources/responses/responses.js";

import { agentConfig } from "../config.js";

export const COMMERCE_MCP_ALL_TOOLS = [
  "search_products",
  "get_product",
  "check_inventory",
  "request_offers",
  "create_order",
  "initiate_payment",
  "get_payment_status",
] as const;

export const COMMERCE_MCP_READ_ONLY_TOOLS = [
  "search_products",
  "get_product",
  "check_inventory",
  "request_offers",
  "get_payment_status",
] as const;

/**
 * The exact 7-tool config from AGENT_SPEC.md §2 / docs/tim-mcp-integration.md.
 * `create_order` and `initiate_payment` are deliberately left out of the
 * `require_approval.never` list — they stay approval-gated at the API level
 * (CLAUDE.md rule 9). This is the ONLY place in the codebase that builds
 * this tool config; see tool-turn.ts for why that matters.
 */
export function buildCommerceMcpTool(): Tool.Mcp {
  return {
    type: "mcp",
    server_label: "visa_commerce",
    server_description:
      "Search the Visa Commerce catalog, create policy-compliant offers, and complete confirmed purchases through saved payment methods.",
    server_url: agentConfig.commerceMcpUrl,
    authorization: agentConfig.commerceMcpAuthToken,
    allowed_tools: [...COMMERCE_MCP_ALL_TOOLS],
    require_approval: {
      never: {
        tool_names: [...COMMERCE_MCP_READ_ONLY_TOOLS],
      },
    },
  };
}
