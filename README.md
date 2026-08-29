# Visa Commerce - NUS Hackathon 2026

Conversational commerce prototype for the Visa x NUS Hackathon. The repository is a TypeScript monorepo that separates user-facing applications, transport adapters, shared contracts, and reusable domain packages so TIM and SANGYOON can develop in parallel.

The repository foundation, shared transport validation, flexible Commerce catalog, Merchant/Catalog/Inventory/Pricing services, search, offers, orders, a safe mock Visa payment flow, and a live Merchant dashboard are implemented. Structured catalog write forms, remote MCP transport, and agent behavior remain in later phases.

## Architecture

```text
Consumer Web / Telegram             Merchant Form
            |                             |
            v                             v
 OpenAI Agent (TIM)                 HTTP REST API
            |                             |
            v                             |
     Commerce MCP Server -----------------+
                      |
                      v
               Commerce Domain
                      |
                      v
              PostgreSQL / Prisma
```

`apps/` contains executable applications and transport/UI code. `packages/` contains reusable contracts, domain boundaries, and database access.

### Commerce access boundary

- Merchants enter catalog, inventory, and pricing data through structured forms. The Merchant UI and REST API do not use OpenAI.
- TIM's OpenAI-powered consumer agent never receives `DATABASE_URL` and never connects directly to PostgreSQL.
- The consumer agent accesses commerce capabilities only through the Commerce MCP tools defined in `SHARED_API_CONTRACT.md`.
- REST handlers and MCP tool handlers are thin adapters over the same services in `packages/commerce`; business rules must not be duplicated in transport code.
- Only the trusted commerce/database layer can read private pricing policies or persist data. MCP responses expose only contract-approved fields.
- Search and inventory tools are read operations. Order and payment tools enforce transaction-specific confirmation, saved-payment-method ownership, validation, and idempotency in the domain layer.
- The Agent sees only a safe `paymentMethodId` or requests the user's default method. Provider credential references stay inside the Commerce backend; raw PAN and CVV are rejected at the API boundary.

The MCP server currently uses local `stdio` transport. The final integration will also expose Streamable HTTP so OpenAI's Responses API can call the remote MCP server. OpenAI documents remote MCP servers as external tool providers reached through a `server_url`, with optional authentication and per-tool approval controls. See the [official OpenAI MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

## Directory map

```text
apps/
  web/          Next.js consumer and merchant surfaces
  api/          Fastify HTTP API
  mcp-server/   Model Context Protocol server
  telegram/     Grammy Telegram bot

packages/
  contracts/    Shared Zod schemas and inferred TypeScript types
  db/           Prisma and PostgreSQL access
  commerce/     Merchant and transaction domain modules
  agent/        Intent, ranking, recommendation, and session boundaries

tests/          Unit, integration, and end-to-end tests
docs/           Architecture and ownership documentation
```

## Ownership

### TIM

- Consumer routes and components in `apps/web`
- `apps/telegram`
- `packages/agent`
- Future users, user intents, and agent sessions

### SANGYOON

- Merchant routes and components in `apps/web`
- `apps/mcp-server`
- `packages/commerce`
- Commerce-side work in `packages/db`
- Merchant, product, inventory, pricing, offer, order, and payment development

### Shared

- `packages/contracts`
- Integration and end-to-end tests
- Root configuration and documentation
- Contract changes

See [SHARED_API_CONTRACT.md](./SHARED_API_CONTRACT.md) for the frozen MVP integration contract. Its Zod implementation in `packages/contracts` is the executable source of truth. Coordinate all shared-contract changes.

## Tech stack

- Node.js, TypeScript, and pnpm workspaces
- Next.js, React, Tailwind CSS, and Zod
- Fastify
- Model Context Protocol TypeScript SDK
- Grammy
- PostgreSQL and Prisma
- OpenAI Node SDK
- Vitest, ESLint, and Prettier

## Prerequisites

- Node.js 24 or newer
- pnpm 11 or newer
- PostgreSQL when database migrations or runtime database access are needed

## Installation

```bash
pnpm install
```

## Environment setup

```bash
cp .env.example .env
```

Fill only the values required by the application you are starting. Never commit `.env` or real secrets.

`OPENAI_API_KEY` is required only by TIM's consumer Agent. Merchant forms, the REST API, the Commerce domain, the MCP server, and database scripts do not use it.

## Local development

Run the main local applications:

```bash
pnpm dev
```

Run applications independently:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:mcp
pnpm dev:telegram
```

The Telegram process requires `TELEGRAM_BOT_TOKEN`. Without it, the application exits with a clear configuration message.

With PostgreSQL, the API, and the web app running, open [http://localhost:3000/merchant](http://localhost:3000/merchant). The dashboard reads the seeded merchants, products, variants, inventory, and saved CSV mappings through the Commerce REST API. Use the merchant switcher in the top-right corner to inspect all six sample merchants; `Orchard Tech` is the default because it demonstrates the smartphone schema and reusable CSV mapping flow.

## Quality commands

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm format:check
pnpm test
```

## Database commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

`pnpm db:generate` does not require a live database. Migrations, seed data, Studio, and runtime database access require a valid `DATABASE_URL`.

`pnpm db:seed` is idempotent. It creates or updates 21 category nodes, seven category schemas, six merchants, six products, eleven variants, inventory, pricing policies, one example CSV mapping profile, and four saved mock Visa payment methods without deleting unrelated local data. The sample catalog includes both shoes and an iPhone, proving that physical goods do not share shoe-specific fields.

## Flexible catalog model

The catalog is standardized in layers instead of forcing every product into one rigid schema:

1. `CommerceDomain` identifies the broad purchase flow: `retail_goods`, `services_subscriptions`, or `bookings`.
2. A hierarchical `categoryId` identifies a comparable product type, for example `retail_goods.apparel.shoes` or `retail_goods.electronics.smartphones`.
3. The versioned `CategorySchema` defines the product-level and variant-level attributes for that category. Shoes can require `size`; smartphones can require `storage`; activities can require `date` and `time`.
4. Stable core columns hold identity, price, currency, billing, availability, and lifecycle data. Category-specific attributes live in validated JSONB.
5. `ProductVariant` owns the SKU, sellable price, variant attributes, and inventory link. Inventory and offers reference the stable `variantId`, never a generated attribute string.

Merchant forms first fetch the selected category schema and generate only the relevant fields. For CSV onboarding, each merchant maps its own headers to canonical paths such as `product.name`, `variant.sku`, or `variant.attributes.storage`. The saved, versioned import profile can be reused for later uploads. This keeps merchant input flexible while giving search and the MCP server one canonical catalog shape. See [Flexible Catalog and Merchant Onboarding](./docs/catalog-and-onboarding.md).

## Merchant REST API

The structured Merchant form uses these implemented endpoints:

| Operation                    | Method  | Endpoint                                     |
| ---------------------------- | ------- | -------------------------------------------- |
| List catalog categories      | `GET`   | `/v1/categories`                             |
| Get category form schema     | `GET`   | `/v1/categories/{categoryId}/schema`         |
| List merchants               | `GET`   | `/v1/merchants`                              |
| Create merchant              | `POST`  | `/v1/merchants`                              |
| Create product with variants | `POST`  | `/v1/merchants/{merchantId}/products`        |
| List merchant products       | `GET`   | `/v1/merchants/{merchantId}/products`        |
| Save CSV import profile      | `POST`  | `/v1/merchants/{merchantId}/import-profiles` |
| List CSV import profiles     | `GET`   | `/v1/merchants/{merchantId}/import-profiles` |
| Update product               | `PATCH` | `/v1/products/{productId}`                   |
| Update variant inventory     | `PUT`   | `/v1/variants/{variantId}/inventory`         |
| Configure pricing            | `PUT`   | `/v1/products/{productId}/pricing-policy`    |

Successful and failed requests use the shared response envelope defined in `packages/contracts`. Category IDs and variant IDs are stable API values; UI labels and arbitrary CSV headers are not used as database relationships.

## Consumer discovery REST API

TIM's Agent and the future MCP adapters use these implemented discovery operations:

| Operation        | Method | Endpoint                   |
| ---------------- | ------ | -------------------------- |
| Search products  | `POST` | `/v1/search`               |
| Get product      | `GET`  | `/v1/products/{productId}` |
| Check inventory  | `POST` | `/v1/inventory/check`      |
| Request offers   | `POST` | `/v1/offers`               |
| Create order     | `POST` | `/v1/orders`               |
| Initiate payment | `POST` | `/v1/payments`             |
| Payment status   | `GET`  | `/v1/payments/{paymentId}` |

The deterministic demo intent (`Nike`, `US 9`, budget `S$180`) finds both matching merchants, then returns only the policy-compliant `Kent Ridge Sports` offer at `S$175`. Offers expire after ten minutes. Public product and offer responses never include merchant minimum prices or private pricing rules.

Order creation requires the frozen `OrderRequest` with `userConfirmed: true`. The Commerce transaction revalidates the Offer, expiry, product, merchant, inventory, fulfillment, and current pricing policy before atomically accepting the Offer, reserving inventory, and creating a `payment_pending` Order. Retrying the same `requestId` returns the original Order without reserving inventory again.

## Saved payment and frictionless checkout

The payment call accepts an Order and an optional safe `paymentMethodId`; omitting it uses the confirmed user's default saved method. The amount and currency always come from the Order, never from the Agent. A successful mock Visa authorization changes the Order to `paid`. A decline or processor failure changes it to `payment_failed` and releases reserved inventory. A verification result keeps the Order pending for a future identity-verification step.

The Agent never receives a provider credential, PAN, or CVV. The database stores the saved method's display metadata, an internal provider/vault reference, and only a SHA-256 fingerprint on the Payment audit record. Request IDs make payment retries idempotent, while a database constraint prevents concurrent active authorizations for the same Order. See [Saved Payment and Agent Checkout](./docs/payment-flow.md).

## Current implementation status

The Commerce database schema, hierarchical taxonomy, versioned category schemas, generic variants, reusable CSV mapping profiles, demo seed, Merchant REST API, live read-only Merchant dashboard, product discovery, inventory matching, deterministic pricing, time-limited Offer generation, explicit confirmation, idempotent Order creation, saved payment methods, and mock Visa authorization are implemented. Structured create/edit forms, CSV file parsing/import execution, agent behavior, identity-verification completion, and remote MCP transport remain in later feature phases.
