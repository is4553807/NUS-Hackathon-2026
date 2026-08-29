import { describe, expect, it } from "vitest";

import {
  assessDelivery,
  attributesSatisfyIntent,
  calculateOfferPrice,
} from "../../packages/commerce/src/index.js";

describe("deterministic offer pricing", () => {
  it("keeps the listed price when negotiation is disabled", () => {
    expect(
      calculateOfferPrice({
        listedPrice: 95,
        availableInventory: 12,
        negotiationEnabled: false,
        minimumPrice: null,
        maxDiscountPercent: null,
      }),
    ).toEqual({
      offeredPrice: 95,
      discountAmount: 0,
      explanation: "Listed price",
    });
  });

  it("excludes Merchant A by respecting its S$190 minimum", () => {
    expect(
      calculateOfferPrice({
        listedPrice: 195,
        availableInventory: 2,
        negotiationEnabled: true,
        minimumPrice: 190,
        maxDiscountPercent: 15.38,
      }).offeredPrice,
    ).toBe(190);
  });

  it("creates the frozen S$175 demo price for Merchant B", () => {
    expect(
      calculateOfferPrice({
        listedPrice: 195,
        availableInventory: 25,
        negotiationEnabled: true,
        minimumPrice: 165,
        maxDiscountPercent: 15.38,
      }),
    ).toEqual({
      offeredPrice: 175,
      discountAmount: 20,
      explanation: "Inventory promotion applied",
    });
  });

  it("caps an inventory discount by maxDiscountPercent", () => {
    expect(
      calculateOfferPrice({
        listedPrice: 195,
        availableInventory: 25,
        negotiationEnabled: true,
        minimumPrice: 150,
        maxDiscountPercent: 5,
      }).offeredPrice,
    ).toBe(185.25);
  });
});

describe("offer matching and delivery", () => {
  it("matches requested attributes while allowing extra variant attributes", () => {
    expect(
      attributesSatisfyIntent(
        { size: "US 9", color: "Black", productType: "basketball_shoes" },
        { size: "us 9", productType: "basketball_shoes" },
      ),
    ).toBe(true);
  });

  it("requires a location for shipped physical goods", () => {
    expect(
      assessDelivery(
        {
          productKind: "physical_good",
          physicalShippingRequired: true,
          bookingStartsAt: null,
        },
        { deliveryLocation: null, deliveryDeadline: null },
        new Date("2026-08-29T12:00:00+08:00"),
      ),
    ).toEqual({ available: false, estimate: null });
  });

  it("rejects a physical delivery that misses the deadline", () => {
    expect(
      assessDelivery(
        {
          productKind: "physical_good",
          physicalShippingRequired: true,
          bookingStartsAt: null,
        },
        {
          deliveryLocation: "NUS",
          deliveryDeadline: "2026-08-29T13:00:00+08:00",
        },
        new Date("2026-08-29T12:00:00+08:00"),
      ).available,
    ).toBe(false);
  });
});
