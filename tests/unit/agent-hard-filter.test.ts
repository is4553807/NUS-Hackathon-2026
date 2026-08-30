import { describe, expect, it } from "vitest";

import type { Response, ResponseOutputItem } from "openai/resources/responses/responses.js";

import { applyHardFilter } from "../../packages/agent/src/hard-filter.js";
import type { RealOffer, ResolvedUserIntent } from "../../packages/agent/src/domain-types.js";
import { extractRequestOffersResult } from "../../packages/agent/src/mcp/extract-offers.js";

function makeOffer(overrides: Partial<RealOffer> = {}): RealOffer {
  return {
    offerId: "offer-1",
    intentId: "intent-1",
    merchantId: "merchant-1",
    merchantName: "Test Merchant",
    productId: "product-1",
    productName: "Test Product",
    variantId: "variant-1",
    commerceDomain: "retail_goods",
    categoryId: "retail_goods.electronics.smartphones",
    listedPrice: 200,
    offeredPrice: 200,
    currency: "SGD",
    quantity: 1,
    quantityAvailable: 5,
    attributes: { storage: "128GB" },
    deliveryAvailable: true,
    deliveryEstimate: null,
    status: "active",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    priceExplanation: "List price.",
    ...overrides,
  };
}

function makeIntent(overrides: Partial<ResolvedUserIntent> = {}): ResolvedUserIntent {
  return {
    rawQuery: "phone",
    categoryCandidates: ["electronics"],
    currency: "SGD",
    requiredAttributes: {},
    quantity: 1,
    category: "electronics",
    budgetMax: 150,
    ...overrides,
  } as ResolvedUserIntent;
}

describe("applyHardFilter", () => {
  it("rejects an over-budget offer deterministically, regardless of any model claim", () => {
    const intent = makeIntent({ budgetMax: 150 });
    const overBudgetOffer = makeOffer({ offerId: "over-budget", offeredPrice: 999 });
    const withinBudgetOffer = makeOffer({ offerId: "within-budget", offeredPrice: 100 });

    const { survivors, rejections } = applyHardFilter([overBudgetOffer, withinBudgetOffer], intent);

    expect(survivors.map((o) => o.offerId)).toEqual(["within-budget"]);
    expect(rejections).toContainEqual(
      expect.objectContaining({ offerId: "over-budget", reason: "OVER_BUDGET" }),
    );
  });

  it("rejects an offer missing a required attribute", () => {
    const intent = makeIntent({ requiredAttributes: { storage: "256GB" } });
    const offer = makeOffer({ attributes: { storage: "128GB" }, offeredPrice: 100 });
    const { survivors, rejections } = applyHardFilter([offer], intent);
    expect(survivors).toHaveLength(0);
    expect(rejections[0]?.reason).toBe("MISSING_REQUIRED_FEATURE");
  });

  it("rejects an unavailable (out of stock) offer", () => {
    const intent = makeIntent();
    const offer = makeOffer({ quantityAvailable: 0 });
    const { survivors, rejections } = applyHardFilter([offer], intent);
    expect(survivors).toHaveLength(0);
    expect(rejections[0]?.reason).toBe("UNAVAILABLE");
  });
});

function fakeResponseWithMcpCall(output: unknown): Response {
  const mcpCall: ResponseOutputItem.McpCall = {
    id: "call-1",
    type: "mcp_call",
    name: "request_offers",
    server_label: "visa_commerce",
    arguments: "{}",
    output: JSON.stringify(output),
  };
  return { output: [mcpCall] } as unknown as Response;
}

describe("AGENT_SPEC.md §4/§6 post-hoc independent validation (TASKS.md item 6)", () => {
  it("blocks an over-budget offer even when the model's own reasoning selected it", () => {
    const intent = makeIntent({ budgetMax: 150 });
    // Simulate a tool result the model saw and reasoned over, where the model
    // (hypothetically, incorrectly) picked the over-budget offer as its
    // recommendation. TIM's backend must never trust that — only its own
    // independent re-run of the hard filter against the extracted data.
    const modelObservedOffers = [
      makeOffer({ offerId: "model-picked-over-budget", offeredPrice: 999 }),
      makeOffer({ offerId: "actually-valid", offeredPrice: 120 }),
    ];

    const response = fakeResponseWithMcpCall({ offers: modelObservedOffers });
    const extracted = extractRequestOffersResult(response);
    expect(extracted.offers).toHaveLength(2);

    const { survivors } = applyHardFilter(extracted.offers, intent);
    const survivorIds = survivors.map((offer) => offer.offerId);

    expect(survivorIds).not.toContain("model-picked-over-budget");
    expect(survivorIds).toEqual(["actually-valid"]);
  });
});
