import { randomUUID } from "node:crypto";

/**
 * AGENT_SPEC.md §7: one requestId per order/payment *attempt*. Retrying the
 * same logical operation (a timeout, a transient failure) must reuse the
 * exact same requestId; a genuinely new operation (a fresh offer after
 * PRICE_CHANGED, a different offer entirely) must get a new one.
 *
 * "Same logical operation" is keyed by the thing being acted on (an offerId
 * for create_order, an orderId for initiate_payment) — not by session or
 * wall-clock time — so a retry of exactly that offer/order always reuses the
 * id, and anything else always gets a fresh one.
 */
export class RequestIdStore {
  private readonly ids = new Map<string, string>();

  getOrCreate(key: string): string {
    const existing = this.ids.get(key);
    if (existing !== undefined) return existing;
    const created = randomUUID();
    this.ids.set(key, created);
    return created;
  }

  /** Called once an attempt terminally succeeds or is abandoned for a new offer/order, so the key can't leak across unrelated future operations that happen to reuse an id (e.g. a new session). */
  clear(key: string): void {
    this.ids.delete(key);
  }
}

export function orderRequestKey(sessionId: string, offerId: string): string {
  return `order:${sessionId}:${offerId}`;
}

export function paymentRequestKey(sessionId: string, orderId: string): string {
  return `payment:${sessionId}:${orderId}`;
}
