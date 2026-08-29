# Architecture

## Layering

```text
UI and transport adapters
  -> reusable domain packages
  -> database package
```

Executable applications belong in `apps/`. Reusable business rules, validation contracts, and persistence access belong in `packages/`.

Route handlers, MCP tool handlers, Telegram handlers, and React components must stay thin. They translate transport input and delegate to the relevant domain package.

## Agent and commerce flow

```text
Agent
  -> MCP
  -> Commerce Domain
  -> Database
```

MCP is a standardized interface into commerce capabilities. It is not the database and must not contain pricing, inventory, order, or payment behavior.

The HTTP API and MCP server may expose overlapping commerce capabilities. Both must call the same services in `packages/commerce` rather than implementing separate behavior.

## Package directions

```text
web            -> contracts
api            -> contracts, commerce, db where no domain exists yet
mcp-server     -> contracts, commerce
telegram       -> contracts, agent
agent          -> contracts
commerce       -> contracts, db
db             -> generated Prisma client
contracts      -> Zod only
```

Circular dependencies are not allowed.

## Catalog and onboarding boundary

```text
Merchant form or CSV headers
  -> category selection
  -> category schema + saved column mapping
  -> canonical Product and ProductVariant records
  -> shared search, offer, inventory, and MCP services
```

The database uses three broad commerce domains and a hierarchical category tree beneath them. A leaf category owns a versioned attribute schema. Stable relational columns store identifiers and transactional fields; validated JSONB stores extensible product and variant attributes.

Product attributes describe the item shared by every sellable option. Variant attributes identify an exact SKU, plan, time slot, or booking option. Price and inventory belong to the variant. This prevents shoe fields such as size from leaking into smartphones, services, or bookings while preserving one consistent search interface.

External merchant headers are accepted only at the ingestion boundary. A `MerchantImportProfile` maps each source header to a canonical path and records the category schema version used during mapping. Search, offers, and MCP tools never read raw CSV column names.

See [Flexible Catalog and Merchant Onboarding](./catalog-and-onboarding.md) for the taxonomy, validation, and plug-and-play onboarding rules.

## Current phase

The repository foundation, shared transport schemas, flexible catalog database, category/form APIs, CSV mapping profiles, Merchant REST adapters, product search, inventory matching, deterministic pricing, time-limited Offer generation, and idempotent Order creation are implemented. CSV execution, the merchant UI, payments, and remote MCP transport remain in later feature phases.
