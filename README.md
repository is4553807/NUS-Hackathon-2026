# Visa Commerce - NUS Hackathon 2026

Conversational commerce prototype for the Visa x NUS Hackathon. The repository is a TypeScript monorepo that separates user-facing applications, transport adapters, shared contracts, and reusable domain packages so TIM and SANGYOON can develop in parallel.

This initial repository contains only the bootable foundation, shared transport validation, and application shells. Commerce, agent, merchant, order, and payment business behavior is intentionally not implemented yet.

## Architecture

```text
Consumer Web / Telegram       Merchant Web
            |                     |
            v                     v
       Agent Domain          HTTP API / MCP
            |                     |
            +------> MCP ---------+
                                  |
                                  v
                           Commerce Domain
                                  |
                                  v
                          PostgreSQL / Prisma
```

`apps/` contains executable applications and transport/UI code. `packages/` contains reusable contracts, domain boundaries, and database access.

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

`pnpm db:generate` does not require a live database. Migrations, Studio, and runtime database access require a valid `DATABASE_URL`.

## Current implementation status

The repository currently proves that the applications, packages, validation contracts, database generator, and development tooling are wired correctly. Product search, dynamic pricing, offer generation, agent behavior, order creation, and payment simulation remain deliberate TODOs for the next development phase.
