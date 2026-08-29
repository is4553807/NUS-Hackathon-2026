# TIM Handoff: Commerce MCP Integration

This document is the consumer-agent integration boundary between TIM's OpenAI/Telegram application and SANGYOON's Commerce backend.

## What is ready

The Commerce MCP server exposes a Streamable HTTP endpoint at `/mcp` and exactly seven frozen tools:

1. `search_products`
2. `get_product`
3. `check_inventory`
4. `request_offers`
5. `create_order`
6. `initiate_payment`
7. `get_payment_status`

Every tool validates the shared Zod contract and delegates to the same services used by the Commerce REST API. TIM must not connect to PostgreSQL or receive `DATABASE_URL`. The MCP process does not need `OPENAI_API_KEY`; that key belongs only in TIM's backend.

## Local server

Start PostgreSQL and then run:

```bash
pnpm dev:mcp
```

The defaults are:

```text
Health: http://127.0.0.1:4100/health
MCP:    http://127.0.0.1:4100/mcp
```

The `/mcp` route is a protocol endpoint, not a browser page. A local MCP client may instead use `pnpm --filter @visa-commerce/mcp-server dev:stdio`.

## Server environment

```dotenv
MCP_TRANSPORT=http
MCP_HOST=127.0.0.1
MCP_PORT=4100
MCP_ALLOWED_HOSTS=
MCP_AUTH_TOKEN=
```

- Loopback development may omit `MCP_AUTH_TOKEN`.
- A non-loopback bind is rejected unless `MCP_AUTH_TOKEN` contains at least 16 characters.
- Set `MCP_ALLOWED_HOSTS` to a comma-separated allowlist when the deployed hostname is known.
- The OpenAI Responses API needs a publicly reachable HTTPS `server_url`. Deploy the server or use a secure MCP tunnel for development; do not expose the local database port.

## OpenAI Responses API configuration

Keep `COMMERCE_MCP_URL` and `COMMERCE_MCP_AUTH_TOKEN` in TIM's server-side environment. Never send either value to Telegram or browser clients.

```ts
const commerceMcpTool = {
  type: "mcp" as const,
  server_label: "visa_commerce",
  server_description:
    "Search the Visa Commerce catalog, create policy-compliant offers, and complete confirmed purchases through saved payment methods.",
  server_url: process.env.COMMERCE_MCP_URL!,
  authorization: process.env.COMMERCE_MCP_AUTH_TOKEN,
  allowed_tools: [
    "search_products",
    "get_product",
    "check_inventory",
    "request_offers",
    "create_order",
    "initiate_payment",
    "get_payment_status",
  ],
  require_approval: {
    never: {
      tool_names: [
        "search_products",
        "get_product",
        "check_inventory",
        "request_offers",
        "get_payment_status",
      ],
    },
  },
};

const response = await openai.responses.create({
  model: process.env.OPENAI_MODEL!,
  input: userMessage,
  tools: [commerceMcpTool],
});
```

This configuration lets discovery, offer generation, and status reads run without an OpenAI approval interruption. `create_order` and `initiate_payment` are intentionally omitted from the `never` list, so they remain approval-gated. This is an application-level safety boundary in addition to the Commerce domain's required `userConfirmed: true` check.

Follow the [official OpenAI MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) when implementing approval continuation and remote-server authentication.

## Recommended conversation sequence

```text
User request
  -> TIM creates a complete UserIntent
  -> search_products
  -> get_product and/or check_inventory when more detail is needed
  -> request_offers
  -> TIM recommends one active Offer and shows the exact transaction preview
  -> user performs an explicit Telegram purchase gesture or confirmation
  -> create_order with userConfirmed: true
  -> initiate_payment with a saved paymentMethodId, or omit it for the default
  -> get_payment_status when polling or recovering a conversation
  -> display PaymentResult
```

TIM must ask for any required category attribute that is missing before requesting offers. For example, shoes may need `size`, while smartphones may need `storage`; use canonical attribute names, not merchant CSV headers.

## Checkout safety rules

- Never invent purchase confirmation. Map a clearly defined Telegram purchase gesture or confirmation message to the frozen `OrderRequest`.
- Never send PAN, CVV, PIN, provider credentials, or `DATABASE_URL` through MCP.
- Send only a safe `paymentMethodId`, or omit it to use the user's confirmed default saved method.
- Treat only `PaymentResult.status === "authorized"` as successful payment.
- If an Offer expires or price/inventory changes, request a fresh Offer and reconfirm the new transaction.
- Preserve `requestId` values when retrying the same order or payment operation so the backend can enforce idempotency.

## Error handling

MCP tool failures return safe JSON containing the same Commerce error code used by the shared contract. Correct invalid inputs on `VALIDATION_ERROR`; request a new Offer on `OFFER_EXPIRED` or `PRICE_CHANGED`; recommend another result on `OUT_OF_STOCK`; and retry `PAYMENT_FAILED` only when the response says it is retryable. Never reinterpret an MCP error as a successful order or payment.
