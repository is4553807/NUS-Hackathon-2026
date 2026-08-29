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

## Current phase

The repository foundation, shared transport schemas, Commerce database, Merchant REST adapters, product search, inventory matching, deterministic pricing, and time-limited Offer generation are implemented. Orders, payments, and MCP transport remain in later feature phases.
