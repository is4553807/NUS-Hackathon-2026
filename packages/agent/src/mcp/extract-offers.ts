import type { Response, ResponseOutputItem } from "openai/resources/responses/responses.js";

import type { RealOffer } from "../domain-types.js";

export interface ExtractedToolCall {
  toolName: string;
  argumentsJson: string;
  outputJson: string | null;
  errorMessage: string | null;
}

function isMcpCall(
  item: ResponseOutputItem,
): item is ResponseOutputItem.McpCall {
  return item.type === "mcp_call";
}

function protocolErrorMessage(item: ResponseOutputItem.McpCall): string | null {
  const error = item.error;
  if (error === null || error === undefined) return null;
  if (error.type === "mcp_tool_execution_error") {
    return typeof error.content === "string" ? error.content : JSON.stringify(error.content);
  }
  return error.message;
}

/**
 * AGENT_SPEC.md §4's enforcement mechanism: inspect the turn's raw content
 * blocks for the actual `mcp_call` matching `request_offers`, independent of
 * whatever the model said about it in its final text. Never trust a
 * model-reported offer — only what the tool itself actually returned.
 */
export function findToolCalls(response: Response, toolName: string): ExtractedToolCall[] {
  return response.output.filter(isMcpCall)
    .filter((item) => item.name === toolName && item.server_label === "visa_commerce")
    .map((item) => ({
      toolName: item.name,
      argumentsJson: item.arguments,
      outputJson: item.output ?? null,
      errorMessage: protocolErrorMessage(item),
    }));
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; retryable: boolean };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    (value as { success: unknown }).success === false
  );
}

export interface ToolJsonOutcome<T> {
  data: T | null;
  /** True if the model never actually called this tool this turn. */
  wasCalled: boolean;
  errorCode: string | null;
  toolErrorMessage: string | null;
  /** The server's own retryable flag (CommerceError.retryable) — never guessed by TIM's code. */
  retryable: boolean;
}

/**
 * Generic version of the AGENT_SPEC.md §4 extraction mechanism — used for
 * request_offers, create_order, and initiate_payment alike. The Commerce
 * MCP server's own error envelope (apps/mcp-server/src/tool-result.ts)
 * always shapes a failure as `{ success: false, error: { code, message } }`,
 * so this is the one place that recognizes it.
 */
export function extractToolJsonResult<T>(response: Response, toolName: string): ToolJsonOutcome<T> {
  const calls = findToolCalls(response, toolName);
  const lastCall = calls.at(-1);

  if (lastCall === undefined) {
    return { data: null, wasCalled: false, errorCode: null, toolErrorMessage: null, retryable: false };
  }

  if (lastCall.errorMessage !== null) {
    return { data: null, wasCalled: true, errorCode: "INTERNAL_ERROR", toolErrorMessage: lastCall.errorMessage, retryable: true };
  }

  if (lastCall.outputJson === null) {
    return { data: null, wasCalled: true, errorCode: "INTERNAL_ERROR", toolErrorMessage: `${toolName} returned no output.`, retryable: true };
  }

  try {
    const parsed: unknown = JSON.parse(lastCall.outputJson);

    if (isErrorEnvelope(parsed)) {
      return {
        data: null,
        wasCalled: true,
        errorCode: parsed.error.code,
        toolErrorMessage: parsed.error.message,
        retryable: parsed.error.retryable,
      };
    }

    return { data: parsed as T, wasCalled: true, errorCode: null, toolErrorMessage: null, retryable: false };
  } catch {
    return { data: null, wasCalled: true, errorCode: "INTERNAL_ERROR", toolErrorMessage: `${toolName} output was not valid JSON.`, retryable: true };
  }
}

export interface RequestOffersOutcome {
  offers: RealOffer[];
  wasCalled: boolean;
  toolErrorMessage: string | null;
}

export function extractRequestOffersResult(response: Response): RequestOffersOutcome {
  const outcome = extractToolJsonResult<{ offers: RealOffer[] }>(response, "request_offers");
  return {
    offers: outcome.data?.offers ?? [],
    wasCalled: outcome.wasCalled,
    toolErrorMessage: outcome.toolErrorMessage,
  };
}
