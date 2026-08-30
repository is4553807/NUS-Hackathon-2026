import type { ErrorCode } from "@visa-commerce/contracts";

import { DEMO_USER_ID } from "./config.js";
import type { RealOffer } from "./domain-types.js";
import { runAgenticTurn } from "./mcp/agentic-turn.js";
import { buildCommerceMcpTool } from "./mcp/commerce-tool.js";
import { extractToolJsonResult } from "./mcp/extract-offers.js";
import type { RequestIdStore } from "./request-id-store.js";
import { orderRequestKey, paymentRequestKey } from "./request-id-store.js";

export interface OrderResultData {
  orderId: string;
  offerId: string;
  totalAmount: number;
  currency: string;
  status: "payment_pending" | "paid" | "payment_failed" | "cancelled";
}

export interface PaymentResultData {
  paymentId: string;
  orderId: string;
  status: "pending" | "requires_verification" | "authorized" | "declined" | "failed" | "cancelled";
  authorizationReference: string | null;
  failureMessage: string | null;
}

export type OrderOutcome =
  | { kind: "created"; requestId: string; order: OrderResultData }
  | { kind: "needs_fresh_offer"; reason: "OFFER_EXPIRED" | "PRICE_CHANGED"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; code: ErrorCode; message: string; retryable: boolean };

export type PaymentOutcome =
  | { kind: "authorized"; requestId: string; payment: PaymentResultData }
  | { kind: "declined"; payment: PaymentResultData }
  | { kind: "pending"; requestId: string; paymentId: string }
  | { kind: "error"; code: ErrorCode; message: string; retryable: boolean };

const ORDER_SYSTEM_PROMPT = `Call create_order exactly once, passing the given JSON object verbatim as its arguments. \
Do not modify any field. Do not call any other tool.`;

const PAYMENT_SYSTEM_PROMPT = `Call initiate_payment exactly once, passing the given JSON object verbatim as its arguments. \
Do not modify any field. Never include a PAN, CVV, PIN, or any raw card data — the payload already carries only a safe paymentMethodId or nothing at all. Do not call any other tool.`;

function classifyOrderError(errorCode: ErrorCode | null, message: string, retryable: boolean): OrderOutcome {
  switch (errorCode) {
    case "OFFER_EXPIRED":
    case "PRICE_CHANGED":
      return { kind: "needs_fresh_offer", reason: errorCode, message };
    case "OUT_OF_STOCK":
    case "DELIVERY_UNAVAILABLE":
      return { kind: "unavailable", message };
    case null:
      return { kind: "error", code: "INTERNAL_ERROR", message, retryable: true };
    default:
      return { kind: "error", code: errorCode, message, retryable };
  }
}

/**
 * AGENT_SPEC.md §10/§13: this is only ever called from the one route wired
 * to the "Confirm & authorize" UI action (apps/api). userConfirmed: true is
 * set here, deterministically, by that action having happened — never by
 * anything the model inferred from conversation tone (CLAUDE.md rule 6).
 *
 * The API-level approval interrupt (create_order is outside the MCP tool's
 * require_approval.never list) is the second, independent gate: this
 * function is the only caller that ever passes autoApprove: true to
 * runAgenticTurn, and only reaches that call after this function itself has
 * already been invoked from the confirmed UI action.
 */
export async function submitOrder(
  offer: RealOffer,
  requestIdStore: RequestIdStore,
  sessionId: string,
): Promise<OrderOutcome> {
  const requestId = requestIdStore.getOrCreate(orderRequestKey(sessionId, offer.offerId));
  const orderRequest = {
    requestId,
    userId: DEMO_USER_ID,
    offerId: offer.offerId,
    userConfirmed: true as const,
    confirmedAt: new Date().toISOString(),
    confirmationChannel: "web" as const,
  };

  const response = await runAgenticTurn({
    systemPrompt: ORDER_SYSTEM_PROMPT,
    userContent: `create_order arguments:\n${JSON.stringify(orderRequest)}`,
    tool: buildCommerceMcpTool(),
    autoApprove: true,
    forceToolName: "create_order",
  });

  const outcome = extractToolJsonResult<OrderResultData>(response, "create_order");

  if (outcome.data !== null) {
    // Idempotency: a successful call clears the stored id so a later,
    // unrelated attempt on this same offerId (which cannot happen again
    // since the offer is now accepted) never reuses a stale requestId.
    requestIdStore.clear(orderRequestKey(sessionId, offer.offerId));
    return { kind: "created", requestId, order: outcome.data };
  }

  if (!outcome.wasCalled) {
    return { kind: "error", code: "INTERNAL_ERROR", message: "The model did not call create_order.", retryable: true };
  }

  return classifyOrderError(outcome.errorCode as ErrorCode | null, outcome.toolErrorMessage ?? "create_order failed.", outcome.retryable);
}

/** AGENT_SPEC.md §8: PAYMENT_FAILED is retried only if the response explicitly marks it retryable — the server's own flag, never guessed here. */
function classifyPaymentError(errorCode: ErrorCode | null, message: string, retryable: boolean): PaymentOutcome {
  if (errorCode === null) {
    return { kind: "error", code: "INTERNAL_ERROR", message, retryable: true };
  }
  return { kind: "error", code: errorCode, message, retryable };
}

export async function submitPayment(
  orderId: string,
  requestIdStore: RequestIdStore,
  sessionId: string,
  paymentMethodId?: string,
): Promise<PaymentOutcome> {
  const requestId = requestIdStore.getOrCreate(paymentRequestKey(sessionId, orderId));
  const paymentRequest = {
    requestId,
    orderId,
    paymentMethod: "mock_visa" as const,
    ...(paymentMethodId !== undefined ? { paymentMethodId } : {}),
  };

  const response = await runAgenticTurn({
    systemPrompt: PAYMENT_SYSTEM_PROMPT,
    userContent: `initiate_payment arguments:\n${JSON.stringify(paymentRequest)}`,
    tool: buildCommerceMcpTool(),
    autoApprove: true,
    forceToolName: "initiate_payment",
  });

  const outcome = extractToolJsonResult<PaymentResultData>(response, "initiate_payment");

  if (outcome.data !== null) {
    const payment = outcome.data;
    if (payment.status === "authorized") {
      requestIdStore.clear(paymentRequestKey(sessionId, orderId));
      return { kind: "authorized", requestId, payment };
    }
    if (payment.status === "declined" || payment.status === "failed") {
      requestIdStore.clear(paymentRequestKey(sessionId, orderId));
      return { kind: "declined", payment };
    }
    // "pending" or "requires_verification" — never assumed a result; poll get_payment_status.
    return { kind: "pending", requestId, paymentId: payment.paymentId };
  }

  if (!outcome.wasCalled) {
    return { kind: "error", code: "INTERNAL_ERROR", message: "The model did not call initiate_payment.", retryable: true };
  }

  return classifyPaymentError(outcome.errorCode as ErrorCode | null, outcome.toolErrorMessage ?? "initiate_payment failed.", outcome.retryable);
}

/** AGENT_SPEC.md §2/§10: "processing" (pending/requires_verification) must be polled, never assumed. */
export async function pollPaymentStatus(paymentId: string): Promise<PaymentResultData> {
  const response = await runAgenticTurn({
    systemPrompt: "Call get_payment_status exactly once with the given paymentId.",
    userContent: `get_payment_status arguments:\n${JSON.stringify({ paymentId })}`,
    tool: buildCommerceMcpTool(),
    autoApprove: false,
    forceToolName: "get_payment_status",
  });

  const outcome = extractToolJsonResult<PaymentResultData>(response, "get_payment_status");
  if (outcome.data === null) {
    throw new Error(outcome.toolErrorMessage ?? "get_payment_status returned no data.");
  }
  return outcome.data;
}
