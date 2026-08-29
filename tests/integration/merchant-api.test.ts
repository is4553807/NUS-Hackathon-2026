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
  category: "retail_goods.apparel.shoes",
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
  externalId: "NSH-GTC3",
  name: "Nike GT Cut 3",
  description: "Basketball shoes",
  commerceDomain: "retail_goods" as const,
  categoryId: "retail_goods.apparel.shoes",
  categoryName: "Shoes",
  productKind: "physical_good" as const,
  billingModel: "one_time" as const,
  availabilityModel: "stock" as const,
  brand: "Nike",
  basePrice: 195,
  currency: "SGD" as const,
  imageUrl: null,
  active: true,
  attributes: { productType: "basketball_shoes" },
  details: { type: "physical_good", shippingRequired: true },
  variants: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const inventory = {
  inventoryId: "b1111111-1111-4111-8111-111111111111",
  merchantId,
  productId,
  variantId: "b1111111-1111-4111-8111-111111111111",
  sku: "NSH-GTC3-US9-BLK",
  attributes: { size: "US 9", color: "Black" },
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
  commerceDomain: product.commerceDomain,
  categoryId: product.categoryId,
  categoryName: product.categoryName,
  basePrice: product.basePrice,
  currency: product.currency,
  imageUrl: null,
  attributes: { productType: "basketball_shoes" },
  variants: [
    {
      variantId: inventory.variantId,
      sku: inventory.sku,
      name: "US 9 / Black",
      attributes: { size: "US 9", color: "Black" },
      listedPrice: 195,
      quantityAvailable: inventory.quantityRemaining,
    },
  ],
};

const intent = {
  intentId,
  query: "Nike basketball shoes",
  commerceDomain: "retail_goods" as const,
  categoryId: "retail_goods.apparel.shoes",
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
  variantId: inventory.variantId,
  commerceDomain: product.commerceDomain,
  categoryId: product.categoryId,
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

const order = {
  orderId: "c548d08f-3b72-4ef3-875b-b0eb8439dcf9",
  offerId: offer.offerId,
  userId: "643f3382-40b2-4343-b4bf-4d62d51da5fb",
  merchantId,
  productId,
  quantity: 1,
  unitPrice: 175,
  totalAmount: 175,
  currency: "SGD" as const,
  userConfirmed: true as const,
  status: "payment_pending" as const,
  createdAt: timestamp,
};

const payment = {
  orderId: order.orderId,
  paymentId: "97d7ee95-8462-48e1-b9db-e8f3b69af78c",
  provider: "Visa" as const,
  status: "authorized" as const,
  amount: order.totalAmount,
  currency: "SGD" as const,
  cardholderVerified: true,
  authorizationReference: "VISA-DEMO-C74EF34FF72B4BD4",
  failureCode: null,
  failureMessage: null,
  updatedAt: timestamp,
};

const services = {
  checkInventory: vi.fn(async () => ({
    available: true,
    quantityAvailable: 25,
    variantId: inventory.variantId,
    checkedAt: timestamp,
  })),
  createMerchant: vi.fn(async () => merchant),
  createOrder: vi.fn(async () => order),
  createProduct: vi.fn(async () => product),
  getPublicProduct: vi.fn(async () => publicProduct),
  getCategorySchema: vi.fn(async () => ({
    categoryId: product.categoryId,
    parentId: "retail_goods.apparel",
    commerceDomain: "retail_goods" as const,
    productKind: "physical_good" as const,
    slug: "shoes",
    name: "Shoes",
    level: 2,
    aliases: ["footwear"],
    active: true,
    schemaVersion: "1.0",
    attributeSchema: { attributes: { size: { type: "string" } } },
  })),
  getPaymentStatus: vi.fn(async () => payment),
  listCategories: vi.fn(async () => [
    {
      categoryId: product.categoryId,
      parentId: "retail_goods.apparel",
      commerceDomain: "retail_goods" as const,
      productKind: "physical_good" as const,
      slug: "shoes",
      name: "Shoes",
      level: 2,
      aliases: ["footwear"],
      active: true,
    },
  ]),
  listImportProfiles: vi.fn(async () => []),
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
  initiatePayment: vi.fn(async () => payment),
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
        commerceDomain: product.commerceDomain,
        categoryId: product.categoryId,
        variantId: inventory.variantId,
        listedPrice: product.basePrice,
        currency: product.currency,
        matchedAttributes: { size: "US 9", color: "Black" },
      },
    ],
  })),
  saveImportProfile: vi.fn(async (input) => ({
    importProfileId: "f6666666-6666-4666-8666-666666666666",
    ...input,
    normalizationRules: input.normalizationRules ?? null,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
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
        category: "retail_goods.apparel.shoes",
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
      "retail_goods.apparel.shoes",
      { productType: "basketball_shoes" },
      {
        type: "physical_good",
        shippingRequired: true,
      },
      { size: "US 9", color: "Black" },
    ],
    [
      "services_subscriptions.digital_products",
      { productType: "learning_bundle" },
      {
        type: "digital_product",
        deliveryMethod: "download",
        fileFormat: "PDF",
      },
      { license: "individual" },
    ],
    [
      "services_subscriptions.professional_services",
      { serviceType: "career_coaching" },
      {
        type: "service",
        serviceType: "career_coaching",
        deliveryMode: "remote",
        durationMinutes: 60,
      },
      { mode: "remote", durationMinutes: 60 },
    ],
    [
      "bookings.activities",
      { experienceType: "outdoor_activity", destination: "Sentosa" },
      {
        type: "booking",
        destination: "Sentosa, Singapore",
        startsAt: "2026-09-05T17:30:00+08:00",
        endsAt: "2026-09-05T19:30:00+08:00",
        capacity: 12,
      },
      { date: "2026-09-05", time: "17:30" },
    ],
  ])(
    "validates and creates a product in %s",
    async (categoryId, attributes, details, variantAttributes) => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/merchants/${merchantId}/products`,
        payload: {
          name: product.name,
          categoryId,
          basePrice: 195,
          attributes,
          variants: [
            {
              sku: "TEST-SKU",
              attributes: variantAttributes,
            },
          ],
          details,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(services.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId,
          categoryId,
          attributes,
          details,
        }),
      );
    },
  );

  it("lists and updates merchant products", async () => {
    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/merchants/${merchantId}/products`,
    });
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/products/${productId}`,
      payload: { basePrice: 190 },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      success: true,
      data: { products: [{ productId }] },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(services.updateProduct).toHaveBeenCalledWith(productId, {
      basePrice: 190,
    });
  });

  it("updates inventory for a stable variant ID", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/variants/${inventory.variantId}/inventory`,
      payload: { quantityAvailable: 10, quantityReserved: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(services.upsertInventory).toHaveBeenCalledWith({
      variantId: inventory.variantId,
      quantityAvailable: 10,
      quantityReserved: 1,
    });
  });

  it("returns category schemas for merchant form generation", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/categories/${product.categoryId}/schema`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        categoryId: product.categoryId,
        schemaVersion: "1.0",
      },
    });
  });

  it("saves a reusable CSV column-mapping profile", async () => {
    const payload = {
      categoryId: "retail_goods.electronics.smartphones",
      name: "Orchard Tech smartphone CSV",
      schemaVersion: "1.0",
      sourceHeaders: ["item_code", "product_title", "storage_size"],
      columnMapping: {
        item_code: "variant.sku",
        product_title: "product.name",
        storage_size: "variant.attributes.storage",
      },
    };
    const response = await app.inject({
      method: "POST",
      url: `/v1/merchants/${merchantId}/import-profiles`,
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(services.saveImportProfile).toHaveBeenCalledWith({
      merchantId,
      ...payload,
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
      data: { available: true, variantId: inventory.variantId },
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

  it("creates an order only after explicit user confirmation", async () => {
    const payload = {
      requestId: "c74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
      userId: order.userId,
      offerId: offer.offerId,
      userConfirmed: true,
      confirmedAt: timestamp,
      confirmationChannel: "telegram",
    };
    const response = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: { orderId: order.orderId, status: "payment_pending" },
    });
    expect(services.createOrder).toHaveBeenCalledWith(payload);
  });

  it("rejects an order without explicit user confirmation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: {
        requestId: "c74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
        userId: order.userId,
        offerId: offer.offerId,
        userConfirmed: false,
        confirmedAt: timestamp,
        confirmationChannel: "telegram",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(services.createOrder).not.toHaveBeenCalled();
  });

  it("authorizes a confirmed Order with a saved Visa method", async () => {
    const payload = {
      requestId: "d74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
      orderId: order.orderId,
      paymentMethod: "mock_visa",
      paymentMethodId: "e1111111-1111-4111-8111-111111111111",
    };
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        paymentId: payment.paymentId,
        status: "authorized",
        amount: 175,
        cardholderVerified: true,
      },
    });
    expect(services.initiatePayment).toHaveBeenCalledWith(payload);
  });

  it("reads PaymentResult without exposing payment credentials", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/payments/${payment.paymentId}`,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toMatchObject({
      paymentId: payment.paymentId,
      status: "authorized",
    });
    expect(body.data).not.toHaveProperty("mockPaymentToken");
    expect(body.data).not.toHaveProperty("paymentTokenFingerprint");
    expect(body.data).not.toHaveProperty("providerCredentialRef");
    expect(services.getPaymentStatus).toHaveBeenCalledWith(payment.paymentId);
  });

  it("rejects raw card data at the payment API boundary", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments",
      payload: {
        requestId: "d74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
        orderId: order.orderId,
        paymentMethod: "mock_visa",
        cardNumber: "4111111111111111",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(services.initiatePayment).not.toHaveBeenCalled();
  });
});
