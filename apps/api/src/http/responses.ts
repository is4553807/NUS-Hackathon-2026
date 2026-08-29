import { randomUUID } from "node:crypto";

import type { ErrorCode, SuccessResponse } from "@visa-commerce/contracts";

type ErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
};

function createMeta(): { requestId: string; timestamp: string } {
  return {
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

export function successResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: createMeta(),
  };
}

export function errorResponse(options: {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}): ErrorResponse {
  return {
    success: false,
    error: {
      code: options.code,
      message: options.message,
      retryable: options.retryable ?? false,
      details: options.details ?? {},
    },
    meta: createMeta(),
  };
}
