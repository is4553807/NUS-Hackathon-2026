import type { ErrorCode } from "@visa-commerce/contracts";

export class CommerceError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(options: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "CommerceError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
}

export function throwNotFound(resource: string, id: string): never {
  throw new CommerceError({
    code: "NOT_FOUND",
    message: `${resource} was not found.`,
    details: { resource, id },
  });
}

export function throwValidationError(
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new CommerceError({
    code: "VALIDATION_ERROR",
    message,
    details,
  });
}
