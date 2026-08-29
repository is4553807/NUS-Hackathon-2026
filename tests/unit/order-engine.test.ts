import { OfferStatus } from "@visa-commerce/db";
import { describe, expect, it } from "vitest";

import {
  CommerceError,
  validateConfirmationTime,
  validateOrderRevalidation,
  type OrderRevalidationInput,
} from "../../packages/commerce/src/index.js";

const now = new Date("2026-08-29T12:00:00+08:00");

const validState: OrderRevalidationInput = {
  offerId: "97d2f034-5e97-494d-944f-63c0697d890a",
  offerStatus: OfferStatus.ACTIVE,
  expiresAt: new Date("2026-08-29T12:10:00+08:00"),
  now,
  productActive: true,
  merchantActive: true,
  deliveryAvailable: true,
  bookingStartsAt: null,
  quantityRequested: 1,
  quantityAvailable: 25,
  originalListedPrice: 195,
  currentListedPrice: 195,
  originalOfferedPrice: 175,
  currentOfferedPrice: 175,
};

function captureCommerceError(action: () => void): CommerceError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CommerceError);
    return error as CommerceError;
  }

  throw new Error("Expected CommerceError to be thrown.");
}

describe("order confirmation", () => {
  it("accepts a current confirmation timestamp", () => {
    expect(validateConfirmationTime("2026-08-29T12:00:00+08:00", now)).toEqual(
      now,
    );
  });

  it("rejects a confirmation timestamp too far in the future", () => {
    const error = captureCommerceError(() =>
      validateConfirmationTime("2026-08-29T12:06:00+08:00", now),
    );

    expect(error.code).toBe("VALIDATION_ERROR");
  });
});

describe("order revalidation", () => {
  it("accepts an unchanged active offer", () => {
    expect(() => validateOrderRevalidation(validState)).not.toThrow();
  });

  it("rejects an expired offer", () => {
    const error = captureCommerceError(() =>
      validateOrderRevalidation({ ...validState, expiresAt: now }),
    );

    expect(error.code).toBe("OFFER_EXPIRED");
  });

  it("rejects insufficient inventory as retryable", () => {
    const error = captureCommerceError(() =>
      validateOrderRevalidation({ ...validState, quantityAvailable: 0 }),
    );

    expect(error.code).toBe("OUT_OF_STOCK");
    expect(error.retryable).toBe(true);
  });

  it("requires confirmation again when the price changes", () => {
    const error = captureCommerceError(() =>
      validateOrderRevalidation({ ...validState, currentOfferedPrice: 180 }),
    );

    expect(error.code).toBe("PRICE_CHANGED");
  });
});
