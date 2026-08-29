import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CommerceError } from "@visa-commerce/commerce";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommerceMcpServer } from "../../apps/mcp-server/src/create-server.js";
import { startCommerceMcpHttpServer } from "../../apps/mcp-server/src/http-server.js";
import type { CommerceMcpServices } from "../../apps/mcp-server/src/services.js";

const merchantId = "11111111-1111-4111-8111-111111111111";
const productId = "a1111111-1111-4111-8111-111111111111";
const variantId = "b1111111-1111-4111-8111-111111111111";
const intentId = "4f7a347c-3f30-4db0-9f85-3b6e9f182116";
const offerId = "97d2f034-5e97-494d-944f-63c0697d890a";
const userId = "643f3382-40b2-4343-b4bf-4d62d51da5fb";
const orderId = "c548d08f-3b72-4ef3-875b-b0eb8439dcf9";
const paymentId = "97d7ee95-8462-48e1-b9db-e8f3b69af78c";
const timestamp = "2026-08-30T12:00:00.000+08:00";

const intent = {
  intentId,
  query: "Nike basketball shoes",
  commerceDomain: "retail_goods" as const,
  categoryId: "retail_goods.apparel.shoes",
  budgetMax: 180,
  currency: "SGD" as const,
  quantity: 1,
  brandPreferences: ["Nike"],
  productAttributes: { size: "US 9", color: "Black" },
  deliveryLocation: "NUS",
  deliveryDeadline: "2026-08-31T18:00:00.000+08:00",
};

const searchData = {
  products: [
    {
      productId,
      merchantId,
      merchantName: "NUS Sneaker Hub",
      productName: "Nike GT Cut 3",
      brand: "Nike",
      commerceDomain: "retail_goods" as const,
      categoryId: "retail_goods.apparel.shoes",
      variantId,
      listedPrice: 195,
      currency: "SGD" as const,
      matchedAttributes: { size: "US 9", color: "Black" },
    },
  ],
};

const publicProduct = {
  productId,
  merchantId,
  merchantName: "NUS Sneaker Hub",
  productName: "Nike GT Cut 3",
  description: "Basketball shoes",
  brand: "Nike",
  commerceDomain: "retail_goods" as const,
  categoryId: "retail_goods.apparel.shoes",
  categoryName: "Shoes",
  basePrice: 195,
  currency: "SGD" as const,
  imageUrl: null,
  attributes: { productType: "basketball_shoes" },
  variants: [
    {
      variantId,
      sku: "NSH-GTC3-US9-BLK",
      name: "US 9 / Black",
      attributes: { size: "US 9", color: "Black" },
      listedPrice: 195,
      quantityAvailable: 25,
    },
  ],
};

const inventory = {
  available: true,
  quantityAvailable: 25,
  variantId,
  checkedAt: timestamp,
};

const offer = {
  offerId,
  intentId,
  merchantId,
  merchantName: "NUS Sneaker Hub",
  productId,
  productName: "Nike GT Cut 3",
  variantId,
  commerceDomain: "retail_goods" as const,
  categoryId: "retail_goods.apparel.shoes",
  listedPrice: 195,
  offeredPrice: 175,
  currency: "SGD" as const,
  quantity: 1,
  quantityAvailable: 25,
  attributes: { size: "US 9", color: "Black" },
  deliveryAvailable: true,
  deliveryEstimate: timestamp,
  status: "active" as const,
  expiresAt: "2026-08-30T12:10:00.000+08:00",
  priceExplanation: "Inventory promotion applied",
};

const order = {
  orderId,
  offerId,
  userId,
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
  orderId,
  paymentId,
  provider: "Visa" as const,
  status: "authorized" as const,
  amount: 175,
  currency: "SGD" as const,
  cardholderVerified: true,
  authorizationReference: "VISA-DEMO-1234567890",
  failureCode: null,
  failureMessage: null,
  updatedAt: timestamp,
};

function createMockServices(): CommerceMcpServices {
  return {
    searchProducts: vi.fn(async () => searchData),
    getPublicProduct: vi.fn(async () => publicProduct),
    checkInventory: vi.fn(async () => inventory),
    requestOffers: vi.fn(async () => ({ offers: [offer] })),
    createOrder: vi.fn(async () => order),
    initiatePayment: vi.fn(async () => payment),
    getPaymentStatus: vi.fn(async () => payment),
  };
}

async function connectInMemory(services: CommerceMcpServices) {
  const server = createCommerceMcpServer(services);
  const client = new Client({ name: "commerce-test", version: "0.1.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

const openClients: Client[] = [];
const openServers: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.allSettled(
    openClients.splice(0).map((client) => client.close()),
  );
  await Promise.allSettled(
    openServers.splice(0).map((server) => server.close()),
  );
});

describe("Commerce MCP tools", () => {
  it("registers the seven frozen tool names with safe annotations", async () => {
    const { client, server } = await connectInMemory(createMockServices());
    openClients.push(client);
    openServers.push(server);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "search_products",
      "get_product",
      "check_inventory",
      "request_offers",
      "create_order",
      "initiate_payment",
      "get_payment_status",
    ]);
    expect(
      tools.find((tool) => tool.name === "search_products")?.annotations,
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(
      tools.find((tool) => tool.name === "initiate_payment")?.annotations,
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("delegates every MCP tool to the shared Commerce services", async () => {
    const services = createMockServices();
    const { client, server } = await connectInMemory(services);
    openClients.push(client);
    openServers.push(server);

    const results = await Promise.all([
      client.callTool({ name: "search_products", arguments: { intent } }),
      client.callTool({ name: "get_product", arguments: { productId } }),
      client.callTool({
        name: "check_inventory",
        arguments: {
          productId,
          attributes: { size: "US 9", color: "Black" },
          quantity: 1,
        },
      }),
      client.callTool({ name: "request_offers", arguments: { intent } }),
      client.callTool({
        name: "create_order",
        arguments: {
          requestId: "8aa0808d-2d46-4b52-8e57-26f5f49a6ef4",
          userId,
          offerId,
          userConfirmed: true,
          confirmedAt: timestamp,
          confirmationChannel: "telegram",
        },
      }),
      client.callTool({
        name: "initiate_payment",
        arguments: {
          requestId: "6d74084d-091a-4026-a8c6-9f1c9ed9da88",
          orderId,
          paymentMethod: "mock_visa",
        },
      }),
      client.callTool({
        name: "get_payment_status",
        arguments: { paymentId },
      }),
    ]);

    expect(results.every((result) => result.isError !== true)).toBe(true);
    expect(results[0]?.structuredContent).toEqual(searchData);
    expect(results[1]?.structuredContent).toEqual(publicProduct);
    expect(results[2]?.structuredContent).toEqual(inventory);
    expect(results[3]?.structuredContent).toEqual({ offers: [offer] });
    expect(results[4]?.structuredContent).toEqual(order);
    expect(results[5]?.structuredContent).toEqual(payment);
    expect(results[6]?.structuredContent).toEqual(payment);
    expect(services.searchProducts).toHaveBeenCalledWith({ intent });
    expect(services.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId, paymentMethod: "mock_visa" }),
    );
  });

  it("returns safe structured Commerce errors without leaking internals", async () => {
    const services = createMockServices();
    services.getPublicProduct = vi.fn(async () => {
      throw new CommerceError({
        code: "NOT_FOUND",
        message: "Product was not found.",
        details: { productId },
      });
    });
    const { client, server } = await connectInMemory(services);
    openClients.push(client);
    openServers.push(server);

    const result = await client.callTool({
      name: "get_product",
      arguments: { productId },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"code":"NOT_FOUND"'),
    });
  });
});

describe("Commerce MCP Streamable HTTP transport", () => {
  it("requires its bearer token and serves the same frozen tool list", async () => {
    const authToken = "commerce-test-token-1234567890";
    const httpServer = await startCommerceMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      authToken,
      services: createMockServices(),
    });
    openServers.push(httpServer);

    const unauthorized = await fetch(httpServer.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });
    expect(unauthorized.status).toBe(401);

    const client = new Client({ name: "http-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(httpServer.url),
      { requestInit: { headers: { authorization: `Bearer ${authToken}` } } },
    );
    await client.connect(transport);
    openClients.push(client);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(7);
    expect(tools.map((tool) => tool.name)).toContain("initiate_payment");
  });
});
