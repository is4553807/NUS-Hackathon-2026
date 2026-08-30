import { apiBaseUrl } from "./api-client";

export interface RealOffer {
  offerId: string;
  merchantName: string;
  productName: string;
  offeredPrice: number;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  priceExplanation: string;
  deliveryEstimate: string | null;
  images?: string[];
}

export interface IntentChip {
  label: string;
  field: string;
}

export type AgentTurnEvent =
  | { type: "system_message"; text: string }
  | { type: "clarifying_question"; question: string }
  | {
      type: "direction_cards";
      cards: Array<{
        productId: string;
        category: string;
        name: string;
        description: string;
        images?: string[];
      }>;
    }
  | {
      type: "provisional_shortlist";
      items: Array<{
        productId: string;
        name: string;
        summary: string;
        images?: string[];
      }>;
    }
  | { type: "intent_chips"; chips: IntentChip[] }
  | { type: "searching_status"; text: string }
  | { type: "tiebreak_question"; question: string }
  | { type: "no_offers"; message: string }
  | {
      type: "comparison";
      winner: { offer: RealOffer; summary: string };
      alternatives: Array<{ offer: RealOffer; reason: string }>;
    }
  | { type: "transaction_preview"; offer: RealOffer; priceChanged: boolean }
  | { type: "new_request_divider" }
  | { type: "error"; message: string };

export interface MessagesResponse {
  sessionId: string;
  events: AgentTurnEvent[];
}

export interface ConfirmResponse {
  sessionId: string;
  events?: AgentTurnEvent[];
  orderId?: string;
  payment?: {
    status: "authorized" | "declined" | "processing";
    reference?: string | null;
    paymentId?: string;
  };
  staleness?: "OFFER_EXPIRED" | "PRICE_CHANGED";
}

export interface PaymentStatusResponse {
  payment: {
    status: string;
    authorizationReference: string | null;
    failureMessage: string | null;
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error("The agent could not process that — try again.");
  }
  return data as T;
}

export function sendMessage(
  sessionId: string | undefined,
  message: string,
): Promise<MessagesResponse> {
  return postJson<MessagesResponse>("/v1/agent/messages", {
    sessionId,
    message,
  });
}

export function editIntent(
  sessionId: string,
  field: string,
): Promise<MessagesResponse> {
  return postJson<MessagesResponse>("/v1/agent/edit-intent", {
    sessionId,
    field,
  });
}

export function confirmPurchase(
  sessionId: string,
  paymentMethodId?: string,
): Promise<ConfirmResponse> {
  return postJson<ConfirmResponse>("/v1/agent/confirm", {
    sessionId,
    paymentMethodId,
  });
}

export function pollPaymentStatus(
  sessionId: string,
  paymentId: string,
): Promise<PaymentStatusResponse> {
  return postJson<PaymentStatusResponse>("/v1/agent/payment-status", {
    sessionId,
    paymentId,
  });
}
