import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { agentConfig } from "../config.js";

/**
 * A plain (non-agentic) MCP client for the one read call TIM's backend makes
 * directly rather than handing to the model: `search_products` during Mode
 * 2b (AGENT_SPEC.md §5 Layer 3). This is deliberate — Mode 2b runs *before*
 * Layer 2 has certified the intent complete, and AGENT_SPEC.md §4 is explicit
 * that "the model isn't handed the MCP tools at all until an intent has
 * cleared Layer 2." So direction-card discovery calls the real MCP tool from
 * TIM's own code, not through the Responses API's agentic tool-orchestration
 * used by tool-turn.ts.
 */
export async function withCommerceMcpClient<T>(
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "tim-consumer-agent", version: "0.1.0" });
  const headers: Record<string, string> = {};
  const token = agentConfig.commerceMcpAuthToken;
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  const transport = new StreamableHTTPClientTransport(
    new URL(agentConfig.commerceMcpUrl),
    { requestInit: { headers } },
  );

  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

export async function callCommerceTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError === true) {
    const text = Array.isArray(result.content)
      ? result.content
          .map((block) => ("text" in block ? block.text : ""))
          .join("")
      : "";
    throw new Error(`Commerce MCP tool "${name}" failed: ${text}`);
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }
  const textBlock = Array.isArray(result.content)
    ? result.content.find((block) => "text" in block)
    : undefined;
  const text =
    textBlock !== undefined && "text" in textBlock ? textBlock.text : "{}";
  return JSON.parse(text) as T;
}
