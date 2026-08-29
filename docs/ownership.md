# Ownership

Ownership is an organizational convention for parallel development, not a security boundary.

## TIM

```text
apps/web/app/(consumer)
apps/web/components/consumer
apps/telegram
packages/agent
```

TIM also owns future user, user-intent, agent-session, intent-extraction, ranking, recommendation, and confirmation UX work.

## SANGYOON

```text
apps/web/app/merchant
apps/web/components/merchant
apps/mcp-server
packages/commerce
packages/db
```

SANGYOON also owns future merchant, product, inventory, pricing-policy, offer, order, and payment work.

## Shared

```text
packages/contracts
tests/integration
tests/e2e
root configuration
docs
```

Changes to a frozen shared contract require review from both TIM and SANGYOON.
