import { describe, expect, it } from "vitest";

import { normalizeCarouselImages } from "../../apps/web/components/consumer/carousel-utils.js";
import {
  resolveCategory,
  type CatalogCategory,
} from "../../packages/agent/src/category-resolution.js";
import {
  emptyDraftIntent,
  type ChatSession,
  type DraftUserIntent,
  type RealOffer,
} from "../../packages/agent/src/domain-types.js";
import {
  buildExtractionContext,
  mergeExtractedIntent,
} from "../../packages/agent/src/layers/extract-intent.js";
import { composeOfferSummary } from "../../packages/agent/src/offer-summary.js";
import {
  clearIntentField,
  resetCompletedConversation,
  resolveStructuralTieByMerchantName,
} from "../../packages/agent/src/orchestrator.js";

function draft(overrides: Partial<DraftUserIntent> = {}): DraftUserIntent {
  return {
    rawQuery: "",
    productQuery: "",
    categoryCandidates: [],
    currency: "SGD",
    requiredAttributes: {},
    quantity: 1,
    ...overrides,
  };
}

function offer(overrides: Partial<RealOffer> = {}): RealOffer {
  return {
    offerId: "offer-1",
    intentId: "intent-1",
    merchantId: "merchant-1",
    merchantName: "North Merchant",
    productId: "product-1",
    productName: "Creator Laptop",
    variantId: "variant-1",
    commerceDomain: "retail_goods",
    categoryId: "retail_goods.electronics.laptops",
    listedPrice: 2_000,
    offeredPrice: 1_900,
    currency: "SGD",
    quantity: 1,
    quantityAvailable: 3,
    attributes: { useCase: "video_editing", ram: "32GB", storage: "1TB SSD" },
    deliveryAvailable: true,
    deliveryEstimate: null,
    status: "active",
    expiresAt: "2026-09-01T00:00:00.000Z",
    priceExplanation: "Listed offer price.",
    ...overrides,
  };
}

describe("Layer 1 accumulated context and merge (Fixture D)", () => {
  it("constructs the request with the draft, recent roles, and latest message", () => {
    const context = buildExtractionContext({
      message: "ideally under $2500",
      currentDraft: draft({
        rawQuery: "I want a laptop for video editing",
        productQuery: "video editing laptop",
        categoryCandidates: ["electronics"],
      }),
      conversationHistory: [
        { role: "user", content: "I want a laptop for video editing" },
        { role: "assistant", content: "What budget are you working with?" },
      ],
    });

    expect(context).toContain('"categoryCandidates":["electronics"]');
    expect(context).toContain("Agent: What budget are you working with?");
    expect(context).toContain("Latest user message: ideally under $2500");
  });

  it("merges a bare budget into the established request even if the model flag is wrong", () => {
    const current = draft({
      rawQuery: "I want a laptop for video editing",
      productQuery: "video editing laptop",
      categoryCandidates: ["electronics"],
    });
    const partial = draft({
      rawQuery: "ideally under $2500",
      budgetMax: 2_500,
    });

    const result = mergeExtractedIntent(current, partial, false);

    expect(result.isContinuation).toBe(true);
    expect(result.draftIntent).toMatchObject({
      productQuery: "video editing laptop",
      categoryCandidates: ["electronics"],
      budgetMax: 2_500,
    });
    expect(result.draftIntent.rawQuery).toContain("laptop for video editing");
    expect(result.draftIntent.rawQuery).toContain("under $2500");
  });

  it("resets only for a clearly different category", () => {
    const current = draft({
      rawQuery: "I need a laptop",
      productQuery: "laptop",
      categoryCandidates: ["electronics"],
      budgetMax: 2_000,
    });
    const replacement = draft({
      rawQuery: "Actually I need tax help",
      productQuery: "tax help",
      categoryCandidates: ["professional_services"],
      budgetMax: 300,
    });

    const result = mergeExtractedIntent(current, replacement, true);
    expect(result.isContinuation).toBe(false);
    expect(result.draftIntent).toEqual(replacement);
  });
});

describe("search rephrasing tolerance", () => {
  const categories: CatalogCategory[] = [
    {
      categoryId: "retail_goods.electronics",
      commerceDomain: "retail_goods",
      name: "Electronics",
      slug: "electronics",
      aliases: ["consumer electronics"],
      level: 1,
    },
    {
      categoryId: "services.professional",
      commerceDomain: "services_subscriptions",
      name: "Professional Services",
      slug: "professional-services",
      aliases: ["consulting", "coaching"],
      level: 1,
    },
  ];

  it("maps equivalent interview-coaching phrases to the same broad retry", async () => {
    const listCategories = async () => categories;
    const first = await resolveCategory(
      "professional_services",
      "1-on-1 coaching for interview prep",
      listCategories,
    );
    const second = await resolveCategory(
      "professional_services",
      "job interview coaching",
      listCategories,
    );

    expect({ id: first.broadCategoryId, query: first.broadQuery }).toEqual({
      id: second.broadCategoryId,
      query: second.broadQuery,
    });
  });
});

describe("grounded conversational offer rendering", () => {
  it("composes one sentence instead of a raw attribute dump", () => {
    const summary = composeOfferSummary(offer());
    expect(summary).toBe(
      "Creator Laptop from North Merchant is SGD 1,900 and includes 32 GB RAM and 1 TB SSD storage.",
    );
    expect(summary).not.toContain("useCase:");
    expect(summary).not.toContain("ram:");
  });
});

describe("ambiguous preference handling (Fixture E)", () => {
  const tied = [
    offer(),
    offer({
      offerId: "offer-2",
      merchantId: "merchant-2",
      merchantName: "South Merchant",
    }),
  ];

  it("answers what differs and re-asks without selecting a merchant", () => {
    const resolution = resolveStructuralTieByMerchantName(
      tied,
      tied,
      "Not really, what's the difference?",
    );

    expect(resolution.kind).toBe("needs_answer");
    if (resolution.kind === "needs_answer") {
      expect(resolution.question).toContain("only the merchant differs");
      expect(resolution.question).toContain("North Merchant or South Merchant");
    }
  });

  it("accepts an explicit no-preference answer without inventing one", () => {
    const resolution = resolveStructuralTieByMerchantName(
      tied,
      tied,
      "Either merchant is fine",
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind === "resolved") {
      expect(resolution.decision.reasoning).toContain(
        "stated no merchant preference",
      );
      expect(resolution.decision.reasoning).not.toContain(
        "stated merchant preference for",
      );
    }
  });
});

describe("image carousel and completion boundary", () => {
  it("normalizes zero, one, and 3+ real image arrays without placeholders", () => {
    expect(normalizeCarouselImages(undefined)).toEqual([]);
    expect(normalizeCarouselImages([])).toEqual([]);
    expect(
      normalizeCarouselImages(["https://merchant.example/one.jpg"]),
    ).toEqual(["https://merchant.example/one.jpg"]);
    expect(
      normalizeCarouselImages([
        "https://merchant.example/one.jpg",
        "https://merchant.example/two.jpg",
        "https://merchant.example/three.jpg",
        "https://merchant.example/one.jpg",
        " ",
      ]),
    ).toEqual([
      "https://merchant.example/one.jpg",
      "https://merchant.example/two.jpg",
      "https://merchant.example/three.jpg",
    ]);
  });

  it("clears every prior-purchase field before the next request (Fixture F)", () => {
    const session: ChatSession = {
      sessionId: "session-1",
      state: "completed",
      draftIntent: draft({
        rawQuery: "video editing laptop",
        productQuery: "video editing laptop",
        categoryCandidates: ["electronics"],
        budgetMax: 2_500,
      }),
      conversationHistory: [{ role: "user", content: "video editing laptop" }],
      sessionBudgetOverride: 2_500,
      lastOffers: [offer()],
      lastComparison: {
        selectedOfferId: "offer-1",
        reasoning: "Grounded reason.",
        rejectedOffers: [],
        askClarifyingQuestion: null,
      },
      order: { orderId: "order-1", requestId: "request-1" },
      payment: { paymentId: "payment-1", requestId: "request-2" },
    };

    expect(resetCompletedConversation(session)).toBe(true);
    expect(session.state).toBe("collecting_intent");
    expect(session.draftIntent).toEqual(emptyDraftIntent());
    expect(session.conversationHistory).toEqual([]);
    expect(session.sessionBudgetOverride).toBeUndefined();
    expect(session.lastOffers).toBeUndefined();
    expect(session.lastComparison).toBeUndefined();
    expect(session.order).toBeUndefined();
    expect(session.payment).toBeUndefined();
  });
});

describe("intent chip editing", () => {
  it("clears the selected field and makes Layer 2 incomplete again", async () => {
    const session: ChatSession = {
      sessionId: "session-edit",
      state: "recommendation_ready",
      draftIntent: draft({
        rawQuery: "video editing laptop under 2500",
        productQuery: "video editing laptop",
        categoryCandidates: ["electronics"],
        budgetMax: 2_500,
      }),
      conversationHistory: [],
      sessionBudgetOverride: 2_500,
    };

    clearIntentField(session, "budgetMax");
    const { resolveMode } =
      await import("../../packages/agent/src/layers/mode-resolver.js");

    expect(session.draftIntent.budgetMax).toBeUndefined();
    expect(session.sessionBudgetOverride).toBeUndefined();
    expect(resolveMode(session.draftIntent).mode).toBe("attribute_discovery");
  });
});
