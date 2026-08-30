import { randomUUID } from "node:crypto";

import type { ResolvedCategory } from "../category-resolution.js";
import type { DraftUserIntent } from "../domain-types.js";

/**
 * The real, live `UserIntent` shape the Commerce MCP server actually
 * validates (packages/contracts/src/user-intent.ts) — deliberately not the
 * shape described in AGENT_SPEC.md §2, which does not match the already
 * -built server (see conversation record / PR description for the full
 * diff). TIM's own DraftUserIntent stays in AGENT_SPEC's conceptual
 * vocabulary; this is the adapter to the wire format.
 */
export interface RealUserIntentPayload {
  intentId: string;
  query: string;
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings";
  categoryId: string | null;
  budgetMax: number;
  currency: "SGD";
  quantity: number;
  brandPreferences: string[];
  productAttributes: Record<string, string>;
  deliveryLocation: string | null;
  deliveryDeadline: string | null;
}

/** No budget has necessarily been stated yet during Mode 2b discovery-only
 * search, but the live search_products schema requires a positive
 * budgetMax even though search_products never actually filters on it
 * (only request_offers does — confirmed against
 * packages/commerce/src/catalog/search.ts vs offers/index.ts). */
export const DISCOVERY_PLACEHOLDER_BUDGET = 1_000_000;

/**
 * CONSUMER_UX.md defines no address-collection step anywhere in the demo
 * flow, but the real `assessDelivery` (packages/commerce/src/offers/index.ts)
 * unconditionally rejects any physical good with `shippingRequired: true`
 * when `deliveryLocation` is null — confirmed live: request_offers silently
 * returned zero offers for the seeded iPhone (shippingRequired: true) even
 * though search_products found it and it was well within budget. Since
 * collecting a real address is out of CONSUMER_UX.md's scope, every session
 * uses this fixed demo delivery location rather than null.
 */
const DEMO_DELIVERY_LOCATION = "Singapore";

function toWireDeadline(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return `${value}T23:59:59.999Z`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function buildRealIntent(
  draft: DraftUserIntent,
  resolvedCategory: ResolvedCategory,
  options: { intentId?: string; budgetMax?: number } = {},
): RealUserIntentPayload {
  const deadline = toWireDeadline(
    draft.deliveryDeadline ?? draft.scheduleDeadline,
  );
  return {
    intentId: options.intentId ?? randomUUID(),
    // packages/commerce/src/catalog/search.ts requires every token in this
    // string to literally appear in a product's text — draft.rawQuery often
    // carries budget/deadline phrasing that would zero out every match, so
    // the cleaned productQuery (AGENT_SPEC.md Layer 1) is used here instead.
    query: draft.productQuery,
    commerceDomain: resolvedCategory.commerceDomain,
    categoryId: resolvedCategory.categoryId,
    budgetMax:
      options.budgetMax ?? draft.budgetMax ?? DISCOVERY_PLACEHOLDER_BUDGET,
    currency: "SGD",
    quantity: draft.quantity,
    brandPreferences: [],
    productAttributes: draft.requiredAttributes,
    deliveryLocation: DEMO_DELIVERY_LOCATION,
    deliveryDeadline: deadline,
  };
}
