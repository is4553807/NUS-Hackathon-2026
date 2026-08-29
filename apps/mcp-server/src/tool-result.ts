import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CommerceError } from "@visa-commerce/commerce";
import type { ErrorCode } from "@visa-commerce/contracts";
import { z } from "zod";

type SafeToolError = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

function errorPayload(error: unknown): SafeToolError {
  if (error instanceof CommerceError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
      },
    };
  }

  if (error instanceof z.ZodError) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The Commerce tool input is invalid.",
        retryable: false,
        details: { issues: z.treeifyError(error) },
      },
    };
  }

  return {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "The Commerce tool could not complete the request.",
      retryable: true,
      details: {},
    },
  };
}

export function toolSuccess<T extends object>(data: T): CallToolResult {
  const structuredContent = data as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export async function executeCommerceTool<T extends object>(
  action: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    return toolSuccess(await action());
  } catch (error) {
    const payload = errorPayload(error);
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(payload) }],
    };
  }
}
