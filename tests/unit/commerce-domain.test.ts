import { InventoryAvailability } from "@visa-commerce/db";
import { describe, expect, it } from "vitest";

import {
  calculateAvailableQuantity,
  deriveInventoryAvailability,
  parseVariantKey,
  roundMoney,
  variantMatchesAttributes,
} from "../../packages/commerce/src/index.js";

describe("commerce inventory rules", () => {
  it("subtracts reservations without returning a negative quantity", () => {
    expect(calculateAvailableQuantity(10, 3)).toBe(7);
    expect(calculateAvailableQuantity(2, 4)).toBe(0);
  });

  it("derives availability from the remaining sellable quantity", () => {
    expect(deriveInventoryAvailability(10, 4)).toBe(
      InventoryAvailability.IN_STOCK,
    );
    expect(deriveInventoryAvailability(5, 0)).toBe(
      InventoryAvailability.LOW_STOCK,
    );
    expect(deriveInventoryAvailability(3, 3)).toBe(
      InventoryAvailability.OUT_OF_STOCK,
    );
  });

  it("matches requested attributes to a stored variant", () => {
    const variantKey = "size=US 9;color=Black";

    expect(parseVariantKey(variantKey)).toEqual({
      size: "US 9",
      color: "Black",
    });
    expect(
      variantMatchesAttributes(variantKey, {
        size: "us 9",
        color: "black",
        delivery: "today",
      }),
    ).toBe(true);
    expect(
      variantMatchesAttributes(variantKey, {
        size: "US 8",
        color: "Black",
      }),
    ).toBe(false);
  });
});

describe("commerce money rules", () => {
  it("rounds monetary values to two decimal places", () => {
    expect(roundMoney(19.999)).toBe(20);
    expect(roundMoney(19.994)).toBe(19.99);
  });
});
