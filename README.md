# Visa Commerce - NUS Hackathon 2026

Conversational commerce prototype for the Visa x NUS Hackathon. The repository is a TypeScript monorepo that separates user-facing applications, transport adapters, shared contracts, and reusable domain packages so TIM and SANGYOON can develop in parallel.

The repository foundation, shared transport validation, Commerce database, and core Merchant/Catalog/Inventory/Pricing services are implemented. Search, offer, order, payment, and agent behavior remain in later phases.

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
- Search and inventory tools are read operations. Order and payment tools must enforce explicit user confirmation, validation, and idempotency in the domain layer.

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
- Future merchants, products, inventory, pricing, offers, orders, and payments

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

`pnpm db:seed` is idempotent. It creates or updates the fixed demo merchants, products, category details, inventory variants, and pricing policies without deleting unrelated local data.

## Merchant REST API

The structured Merchant form uses these implemented endpoints:

| Operation              | Method  | Endpoint                                          |
| ---------------------- | ------- | ------------------------------------------------- |
| Create merchant        | `POST`  | `/v1/merchants`                                   |
| Create product         | `POST`  | `/v1/merchants/{merchantId}/products`             |
| List merchant products | `GET`   | `/v1/merchants/{merchantId}/products`             |
| Update product         | `PATCH` | `/v1/products/{productId}`                        |
| Update inventory       | `PUT`   | `/v1/products/{productId}/inventory/{variantKey}` |
| Configure pricing      | `PUT`   | `/v1/products/{productId}/pricing-policy`         |

`variantKey` must be URL-encoded when it contains spaces, semicolons, or equals signs. Successful and failed requests use the shared response envelope defined in `packages/contracts`.

## Consumer discovery REST API

TIM's Agent and the future MCP adapters use these implemented discovery operations:

| Operation       | Method | Endpoint                   |
| --------------- | ------ | -------------------------- |
| Search products | `POST` | `/v1/search`               |
| Get product     | `GET`  | `/v1/products/{productId}` |
| Check inventory | `POST` | `/v1/inventory/check`      |
| Request offers  | `POST` | `/v1/offers`               |

The deterministic demo intent (`Nike`, `US 9`, budget `S$180`) finds both matching merchants, then returns only the policy-compliant `Kent Ridge Sports` offer at `S$175`. Offers expire after ten minutes. Public product and offer responses never include merchant minimum prices or private pricing rules.

## Current implementation status

The Commerce database schema, fixed four-category taxonomy, demo seed, reusable Commerce services, Merchant REST API, product discovery, inventory matching, deterministic pricing, and time-limited Offer generation are implemented. Agent behavior, order creation, payment simulation, and remote MCP transport remain in later feature phases.
