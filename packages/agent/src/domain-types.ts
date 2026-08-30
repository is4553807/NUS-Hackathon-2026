/**
 * TIM's own demo-scope vocabulary (AGENT_SPEC.md §1). These two labels are
 * not known to the Commerce MCP server at all — it has a general, non
 * hardcoded category taxonomy (see category-resolution.ts) — they exist only
 * so TIM's Layer 1/2 pipeline has a fixed, small "which required-fields set
 * applies" switch (AGENT_SPEC.md §3).
 */
export const DEMO_CATEGORIES = [
  "electronics",
  "professional_services",
] as const;
export type DemoCategory = (typeof DEMO_CATEGORIES)[number];

/**
 * Layer 1 output: a draft intent extracted from the raw message, before the
 * deterministic completeness check (Layer 2) has run. Nothing here has been
 * validated against a real merchant catalog yet.
 */
export interface DraftUserIntent {
  rawQuery: string;
  /**
   * A short, product-focused phrase suitable for a real merchant catalog
   * text search (product name/description/attribute-value matching) — the
   * user's need with budget, deadline, and quantity phrasing stripped out.
   * The real search_products/request_offers query matching requires every
   * token to appear somewhere in the product's text, so a stray word like
   * "under" or "2500" from the raw sentence silently zeroes out every
   * result (confirmed against packages/commerce/src/catalog/search.ts).
   */
  productQuery: string;
  categoryCandidates: DemoCategory[];
  budgetMax?: number;
  currency: string;
  /** Canonical attribute names only ("size", "storage") — never a merchant CSV header. */
  requiredAttributes: Record<string, string>;
  deliveryDeadline?: string;
  scheduleDeadline?: string;
  quantity: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export type Mode =
  | { mode: "category_discovery" }
  | {
      mode: "attribute_discovery";
      category: DemoCategory;
      missingFields: string[];
    }
  | { mode: "directed"; intent: ResolvedUserIntent };

declare const resolvedBrand: unique symbol;

/**
 * Only producible by mode-resolver.ts's "directed" branch. This is the type
 * that gates tool-turn.ts (AGENT_SPEC.md §4/§5 Layer 4) — a function that
 * only accepts a ResolvedUserIntent structurally cannot be called before
 * Layer 2 has certified the intent complete, regardless of what any caller
 * intends.
 */
export type ResolvedUserIntent = DraftUserIntent & {
  category: DemoCategory;
  budgetMax: number;
  readonly [resolvedBrand]: true;
};

export interface ChatSession {
  sessionId: string;
  state:
    | "collecting_intent"
    | "intent_ready"
    | "searching"
    | "evaluating_offers"
    | "awaiting_preference"
    | "recommendation_ready"
    | "awaiting_confirmation"
    | "confirmed"
    | "payment_pending"
    | "completed";
  draftIntent: DraftUserIntent;
  /**
   * Recent conversational context is stored explicitly with the session so
   * Layer 1 never has to reconstruct an ongoing request from the latest
   * message alone. The orchestrator keeps this bounded before each model
   * call; the accumulated draft remains the authoritative structured state.
   */
  conversationHistory: ConversationTurn[];
  sessionBudgetOverride?: number;
  lastComparison?: ComparisonResult;
  lastOffers?: RealOffer[];
  pendingClarification?: string;
  order?: { orderId: string; requestId: string };
  payment?: { paymentId: string; requestId: string };
}

export function emptyDraftIntent(): DraftUserIntent {
  return {
    rawQuery: "",
    productQuery: "",
    categoryCandidates: [],
    currency: "SGD",
    requiredAttributes: {},
    quantity: 1,
  };
}

// Re-exported shapes of the real, live Commerce contract (packages/contracts)
// so the rest of the agent package never needs to import @visa-commerce/db
// or anything that touches Postgres directly (CLAUDE.md rule 11).
export interface RealOffer {
  offerId: string;
  intentId: string;
  merchantId: string;
  merchantName: string;
  productId: string;
  productName: string;
  variantId: string;
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings";
  categoryId: string;
  listedPrice: number;
  offeredPrice: number;
  currency: string;
  quantity: number;
  quantityAvailable: number;
  attributes: Record<string, string | number | boolean>;
  deliveryAvailable: boolean;
  deliveryEstimate: string | null;
  status: "active" | "expired" | "accepted" | "cancelled";
  expiresAt: string;
  priceExplanation: string;
  /** Pending in the current Commerce MCP schema. Kept optional so the UI can
   * consume it as soon as the backend adds it without ever inventing a
   * placeholder in the meantime. */
  images?: string[];
}

export type RejectionReason =
  | "OVER_BUDGET"
  | "MISSING_REQUIRED_FEATURE"
  | "MISSED_DEADLINE"
  | "UNAVAILABLE";

export interface HardFilterResult {
  survivors: RealOffer[];
  rejections: Array<{
    offerId: string;
    reason: RejectionReason;
    detail: string;
  }>;
}

export interface ComparisonResult {
  selectedOfferId: string;
  reasoning: string;
  rejectedOffers: Array<{ offerId: string; reason: string }>;
  askClarifyingQuestion: string | null;
}
