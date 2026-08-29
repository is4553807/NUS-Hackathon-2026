import { CommerceError } from "@visa-commerce/commerce";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";
import type { CommerceApiServices } from "../../apps/api/src/services.js";

const merchantId = "11111111-1111-4111-8111-111111111111";
const productId = "a1111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-29T12:00:00.000Z";
const intentId = "4f7a347c-3f30-4db0-9f85-3b6e9f182116";

const merchant = {
  merchantId,
  name: "NUS Sneaker Hub",
  category: "physical_goods",
  description: null,
  currency: "SGD" as const,
  contactEmail: "merchant@example.com",
  status: "active" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const product = {
  productId,
  merchantId,
  merchantName: merchant.name,
  name: "Nike GT Cut 3",
  description: "Basketball shoes",
  category: "physical_goods" as const,
  brand: "Nike",
  listedPrice: 195,
  currency: "SGD" as const,
  imageUrl: null,
  active: true,
  details: {
    sku: "NSH-GTC3-BLK",
    sizeOptions: ["US 9"],
    colorOptions: ["Black"],
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const inventory = {
  inventoryId: "b1111111-1111-4111-8111-111111111111",
  merchantId,
  productId,
  variantKey: "size=US 9;color=Black",
  quantityAvailable: 10,
  quantityReserved: 1,
  quantityRemaining: 9,
  availability: "in_stock" as const,
  updatedAt: timestamp,
};

const pricingPolicy = {
  pricingPolicyId: "c1111111-1111-4111-8111-111111111111",
  merchantId,
  productId,
  negotiationEnabled: true,
  minimumPrice: 165,
  maxDiscountPercent: 15,
  inventoryDiscountEnabled: true,
  rules: { strategy: "inventory_aware" },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const publicProduct = {
  productId,
  merchantId,
  merchantName: merchant.name,
  productName: product.name,
  description: product.description,
  brand: product.brand,
  category: product.category,
  listedPrice: product.listedPrice,
  currency: product.currency,
  imageUrl: null,
  attributes: { productType: "basketball_shoes" },
  variants: [
    {
      variantKey: inventory.variantKey,
      attributes: { size: "US 9", color: "Black" },
      quantityAvailable: inventory.quantityRemaining,
    },
  ],
};

const intent = {
  intentId,
  category: "physical_goods" as const,
  budgetMax: 180,
  currency: "SGD" as const,
  quantity: 1,
  brandPreferences: ["Nike"],
  productAttributes: { size: "US 9" },
  deliveryLocation: "NUS",
  deliveryDeadline: "2026-08-30T18:00:00+08:00",
};

const offer = {
  offerId: "97d2f034-5e97-494d-944f-63c0697d890a",
  intentId,
  merchantId,
  merchantName: merchant.name,
  productId,
  productName: product.name,
  listedPrice: 195,
  offeredPrice: 175,
  currency: "SGD" as const,
  quantity: 1,
  quantityAvailable: 25,
  attributes: { size: "US 9", color: "Black" },
  deliveryAvailable: true,
  deliveryEstimate: "2026-08-29T14:00:00.000Z",
  status: "active" as const,
  expiresAt: "2026-08-29T12:10:00.000Z",
  priceExplanation: "Inventory promotion applied",
};

const services = {
  checkInventory: vi.fn(async () => ({
    available: true,
    quantityAvailable: 25,
    variantKey: inventory.variantKey,
    checkedAt: timestamp,
  })),
  createMerchant: vi.fn(async () => merchant),
  createProduct: vi.fn(async () => product),
  getPublicProduct: vi.fn(async () => publicProduct),
  listMerchantProducts: vi.fn(async (requestedMerchantId: string) => {
    if (requestedMerchantId !== merchantId) {
      throw new CommerceError({
        code: "NOT_FOUND",
        message: "Merchant was not found.",
        details: { merchantId: requestedMerchantId },
      });
    }
    return [product];
  }),
  updateProduct: vi.fn(async () => product),
  upsertInventory: vi.fn(async () => inventory),
  configurePricingPolicy: vi.fn(async () => pricingPolicy),
  requestOffers: vi.fn(async () => ({ offers: [offer] })),
  searchProducts: vi.fn(async () => ({
    products: [
      {
        productId,
        merchantId,
        merchantName: merchant.name,
        productName: product.name,
        brand: product.brand,
        category: product.category,
        listedPrice: product.listedPrice,
        currency: product.currency,
        matchedAttributes: { size: "US 9", color: "Black" },
      },
    ],
  })),
} satisfies CommerceApiServices;

const app = buildApp({ logger: false, commerceServices: services });

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe("Merchant REST API", () => {
  it("creates a merchant through the shared success envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      payload: {
        name: merchant.name,
        category: "physical_goods",
        contactEmail: merchant.contactEmail,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: { merchantId, name: merchant.name },
      meta: { requestId: expect.any(String), timestamp: expect.any(String) },
    });
  });

  it("rejects an invalid merchant payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      payload: { name: "", contactEmail: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
    expect(services.createMerchant).not.toHaveBeenCalled();
  });

  it.each([
    [
      "physical_goods",
      {
        sku: "NSH-GTC3-BLK",
        sizeOptions: ["US 9"],
        colorOptions: ["Black"],
      },
    ],
    ["digital_products", { deliveryMethod: "download", fileFormat: "PDF" }],
    [
      "services",
      {
        serviceType: "career_coaching",
        deliveryMode: "remote",
        durationMinutes: 60,
      },
    ],
    [
      "bookings_experiences",
      {
        destination: "Sentosa, Singapore",
        startsAt: "2026-09-05T17:30:00+08:00",
        endsAt: "2026-09-05T19:30:00+08:00",
        capacity: 12,
      },
    ],
  ])("validates and creates a %s product", async (category, details) => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/merchants/${merchantId}/products`,
      payload: {
        name: product.name,
        category,
        listedPrice: 195,
        details,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(services.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId, category, details }),
    );
  });

  it("lists and updates merchant products", async () => {
    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/merchants/${merchantId}/products`,
    });
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/products/${productId}`,
      payload: { listedPrice: 190 },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      success: true,
      data: { products: [{ productId }] },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(services.updateProduct).toHaveBeenCalledWith(productId, {
      listedPrice: 190,
    });
  });

  it("updates a URL-encoded inventory variant", async () => {
    const variantKey = encodeURIComponent("size=US 9;color=Black");
    const response = await app.inject({
      method: "PUT",
      url: `/v1/products/${productId}/inventory/${variantKey}`,
      payload: { quantityAvailable: 10, quantityReserved: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(services.upsertInventory).toHaveBeenCalledWith({
      productId,
      variantKey: "size=US 9;color=Black",
      quantityAvailable: 10,
      quantityReserved: 1,
    });
  });

  it("configures a private pricing policy", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/products/${productId}/pricing-policy`,
      payload: {
        negotiationEnabled: true,
        minimumPrice: 165,
        maxDiscountPercent: 15,
        inventoryDiscountEnabled: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(services.configurePricingPolicy).toHaveBeenCalledWith({
      productId,
      negotiationEnabled: true,
      minimumPrice: 165,
      maxDiscountPercent: 15,
      inventoryDiscountEnabled: true,
    });
  });

  it("maps Commerce errors to the shared error envelope", async () => {
    const unknownMerchantId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const response = await app.inject({
      method: "GET",
      url: `/v1/merchants/${unknownMerchantId}/products`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Merchant was not found.",
      },
    });
  });
});

describe("Consumer commerce REST API", () => {
  it("searches products using a frozen UserIntent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/search",
      payload: { intent },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { products: [{ productId, matchedAttributes: { size: "US 9" } }] },
    });
    expect(services.searchProducts).toHaveBeenCalledWith({ intent });
  });

  it("returns public product data without private pricing fields", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/products/${productId}`,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toMatchObject({ productId, variants: expect.any(Array) });
    expect(body.data).not.toHaveProperty("minimumPrice");
    expect(body.data).not.toHaveProperty("pricingPolicy");
    expect(body.data).not.toHaveProperty("fulfillmentUrl");
  });

  it("checks a requested product variant's inventory", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/inventory/check",
      payload: {
        productId,
        attributes: { size: "US 9", color: "Black" },
        quantity: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { available: true, variantKey: inventory.variantKey },
    });
  });

  it("creates time-limited offers from a valid intent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/offers",
      payload: { intent },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        offers: [
          {
            offeredPrice: 175,
            status: "active",
            priceExplanation: "Inventory promotion applied",
          },
        ],
      },
    });
  });
});
