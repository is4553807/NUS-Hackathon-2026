import { describe, expect, it } from "vitest";

import type { DraftUserIntent } from "../../packages/agent/src/domain-types.js";
import { resolveMode } from "../../packages/agent/src/layers/mode-resolver.js";
import { RequestIdStore, orderRequestKey } from "../../packages/agent/src/request-id-store.js";

function draft(overrides: Partial<DraftUserIntent> = {}): DraftUserIntent {
  return {
    rawQuery: "",
    categoryCandidates: [],
    currency: "SGD",
    requiredAttributes: {},
    quantity: 1,
    ...overrides,
  };
}

describe("Layer 2 mode resolution (AGENT_SPEC.md §5)", () => {
  it("routes an ambiguous message (0 candidates) to category_discovery", () => {
    expect(resolveMode(draft({ categoryCandidates: [] })).mode).toBe("category_discovery");
  });

  it("routes a genuinely ambiguous message (2 candidates) to category_discovery", () => {
    expect(
      resolveMode(draft({ categoryCandidates: ["electronics", "professional_services"] })).mode,
    ).toBe("category_discovery");
  });

  it("routes a resolved category missing budgetMax to attribute_discovery", () => {
    const mode = resolveMode(draft({ categoryCandidates: ["electronics"] }));
    expect(mode.mode).toBe("attribute_discovery");
    if (mode.mode === "attribute_discovery") {
      expect(mode.missingFields).toContain("budgetMax");
    }
  });

  it("routes a complete intent to directed (Mode 1)", () => {
    const mode = resolveMode(draft({ categoryCandidates: ["electronics"], budgetMax: 150 }));
    expect(mode.mode).toBe("directed");
    if (mode.mode === "directed") {
      expect(mode.intent.budgetMax).toBe(150);
      expect(mode.intent.category).toBe("electronics");
    }
  });
});

describe("AGENT_SPEC.md §7 idempotency (TASKS.md item 16)", () => {
  it("reuses the exact same requestId on a retry of the same offer", () => {
    const store = new RequestIdStore();
    const key = orderRequestKey("session-1", "offer-1");

    const firstAttemptRequestId = store.getOrCreate(key);
    // Simulate a timeout: the caller retries the same logical create_order attempt.
    const retryRequestId = store.getOrCreate(key);

    expect(retryRequestId).toBe(firstAttemptRequestId);
  });

  it("issues a different requestId for a genuinely different offer", () => {
    const store = new RequestIdStore();
    const first = store.getOrCreate(orderRequestKey("session-1", "offer-1"));
    const second = store.getOrCreate(orderRequestKey("session-1", "offer-2"));
    expect(second).not.toBe(first);
  });

  it("clearing a key means a later, unrelated call gets a fresh id", () => {
    const store = new RequestIdStore();
    const key = orderRequestKey("session-1", "offer-1");
    const first = store.getOrCreate(key);
    store.clear(key);
    const afterClear = store.getOrCreate(key);
    expect(afterClear).not.toBe(first);
  });
});
