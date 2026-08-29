import { InventoryAvailability, ProductKind } from "@visa-commerce/db";
import { describe, expect, it } from "vitest";

import {
  buildAutomaticSku,
  calculateAvailableQuantity,
  deriveInventoryAvailability,
  nextAvailableSku,
  parseCsvText,
  roundMoney,
  suggestImportMapping,
  validateCategoryAttributes,
  validateImportMapping,
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
    const variantAttributes = {
      size: "US 9",
      color: "Black",
    };
    expect(
      variantMatchesAttributes(variantAttributes, {
        size: "us 9",
      }),
    ).toBe(true);
    expect(
      variantMatchesAttributes(variantAttributes, {
        size: "US 8",
        color: "Black",
      }),
    ).toBe(false);
  });

  it("validates category-defined product and variant fields", () => {
    const schema = {
      attributes: {
        model: { type: "string", scope: "product", required: true },
        storage: { type: "string", scope: "variant", required: true },
      },
    };

    expect(() =>
      validateCategoryAttributes({
        schema,
        productAttributes: { model: "iPhone 16 Pro" },
        variants: [{ attributes: { storage: "256GB", color: "Black" } }],
      }),
    ).not.toThrow();
  });

  it("accepts different CSV headers only when they map to canonical fields", () => {
    expect(() =>
      validateImportMapping({
        sourceHeaders: [
          "item_title",
          "unit_price_sgd",
          "item_type",
          "model_name",
          "capacity",
          "color_name",
        ],
        columnMapping: {
          item_title: "product.name",
          unit_price_sgd: "variant.listedPrice",
          item_type: "product.attributes.productType",
          model_name: "product.attributes.model",
          capacity: "variant.attributes.storage",
          color_name: "variant.attributes.color",
        },
        attributeSchema: {
          attributes: {
            productType: {
              type: "string",
              scope: "product",
              required: true,
            },
            model: { type: "string", scope: "product", required: true },
            storage: { type: "string", scope: "variant", required: true },
            color: { type: "string", scope: "variant", required: true },
          },
        },
        productKind: ProductKind.PHYSICAL_GOOD,
      }),
    ).not.toThrow();
  });

  it("rejects merchant CSV fields that bypass the canonical category schema", () => {
    expect(() =>
      validateImportMapping({
        sourceHeaders: ["item_title", "price", "shoe_size"],
        columnMapping: {
          item_title: "product.name",
          price: "variant.listedPrice",
          shoe_size: "merchant.custom_size",
        },
        attributeSchema: {
          attributes: {
            size: { type: "string", scope: "variant", required: true },
          },
        },
        productKind: ProductKind.PHYSICAL_GOOD,
      }),
    ).toThrow("canonical catalog paths");
  });
});

describe("commerce money rules", () => {
  it("rounds monetary values to two decimal places", () => {
    expect(roundMoney(19.999)).toBe(20);
    expect(roundMoney(19.994)).toBe(19.99);
  });
});

describe("merchant-friendly SKU generation", () => {
  it("builds a readable SKU when the merchant leaves it blank", () => {
    expect(
      buildAutomaticSku({
        merchantName: "Kent Ridge Sports",
        productName: "Nike GT Cut 3",
        variantName: "US 10 / Black",
        attributes: { size: "US 10", color: "Black" },
        position: 0,
      }),
    ).toBe("KRS-NIK-GT-CUT-3-US-10-BLA");
  });

  it("adds a suffix when an automatically generated SKU already exists", () => {
    expect(
      nextAvailableSku("KRS-GTC3-US10-BLK", new Set(["KRS-GTC3-US10-BLK"])),
    ).toBe("KRS-GTC3-US10-BLK-2");
  });
});

describe("CSV catalog onboarding", () => {
  it("parses quoted commas, escaped quotes, and a UTF-8 BOM", () => {
    expect(
      parseCsvText(
        '\uFEFFproduct_name,description,price\r\n"iPhone 16 Pro","A ""Pro"", phone","1,599"\r\n',
      ),
    ).toEqual({
      headers: ["product_name", "description", "price"],
      rows: [
        {
          product_name: "iPhone 16 Pro",
          description: 'A "Pro", phone',
          price: "1,599",
        },
      ],
    });
  });

  it("maps merchant headers to core and category-specific fields", () => {
    expect(
      suggestImportMapping({
        headers: [
          "item_title",
          "unit_price_sgd",
          "item_type",
          "model",
          "storage_size",
          "colour",
          "stock_on_hand",
        ],
        attributeSchema: {
          attributes: {
            productType: {
              type: "string",
              scope: "product",
              required: true,
              aliases: ["item_type"],
            },
            model: { type: "string", scope: "product", required: true },
            storage: {
              type: "string",
              scope: "variant",
              required: true,
              aliases: ["storage_size"],
            },
            color: {
              type: "string",
              scope: "variant",
              required: true,
              aliases: ["colour"],
            },
          },
        },
        productKind: ProductKind.PHYSICAL_GOOD,
      }),
    ).toMatchObject({
      item_title: "product.name",
      unit_price_sgd: "product.basePrice",
      item_type: "product.attributes.productType",
      model: "product.attributes.model",
      storage_size: "variant.attributes.storage",
      colour: "variant.attributes.color",
      stock_on_hand: "inventory.quantityAvailable",
    });
  });
});
