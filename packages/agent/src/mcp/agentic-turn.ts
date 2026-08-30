import type {
  Response,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses.js";

import { agentConfig } from "../config.js";
import { getOpenAiClient } from "../openai-client.js";

export interface AgenticTurnInput {
  systemPrompt: string;
  userContent: string;
  tool: Tool.Mcp;
  /**
   * Only ever true for order-flow.ts, and only reached after TIM's own code
   * has already set userConfirmed: true from a real UI confirmation tap —
   * never because the model asked nicely. This function itself does not
   * decide whether approval is warranted; it only mechanically answers the
   * API-level approval interrupt once the caller has already decided to.
   */
  autoApprove: boolean;
  /**
   * Forces the model to call this exact tool rather than leaving it to
   * discretion. Needed because live testing showed the model will
   * sometimes just describe having called create_order in its final text
   * without ever actually invoking it — a case extract-offers.ts correctly
   * treats as "not called" (never a false success), but which should be
   * prevented outright for the order/payment flows where a real call is
   * always required.
   */
  forceToolName?: string;
}

/**
 * Drives one Responses API turn against the commerce MCP tool, resolving
 * any `mcp_approval_request` items (create_order / initiate_payment are
 * deliberately outside the tool's `require_approval.never` list — AGENT_SPEC
 * §2) when the caller has authorized auto-approval. Returns the final
 * response after all approvals in the chain are resolved.
 */
export async function runAgenticTurn(
  input: AgenticTurnInput,
): Promise<Response> {
  const client = getOpenAiClient();
  let response = await client.responses.create({
    model: agentConfig.openaiModel,
    tools: [input.tool],
    ...(input.forceToolName !== undefined
      ? {
          tool_choice: {
            type: "mcp" as const,
            server_label: input.tool.server_label,
            name: input.forceToolName,
          },
        }
      : {}),
    input: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userContent },
    ],
  });

  for (let guard = 0; guard < 5; guard += 1) {
    const approvalRequests = response.output.filter(
      (item) => item.type === "mcp_approval_request",
    );
    if (approvalRequests.length === 0) break;

    if (!input.autoApprove) {
      throw new Error(
        "The model attempted an approval-gated commerce tool call in a turn that is not authorized to approve one.",
      );
    }

    const approvalResponses: ResponseInputItem[] = approvalRequests.map(
      (request) => ({
        type: "mcp_approval_response",
        approval_request_id: request.id,
        approve: true,
      }),
    );

    response = await client.responses.create({
      model: agentConfig.openaiModel,
      tools: [input.tool],
      previous_response_id: response.id,
      input: approvalResponses,
    });
  }

  return response;
}
