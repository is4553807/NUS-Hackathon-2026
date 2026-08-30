# CLAUDE.md — TIM consumer build

**This file set is the complete and only source of truth for TIM's scope.** It replaces every prior working doc. There is no separate shared contract, ownership map, or architecture doc in this project — those were removed deliberately to prevent building against stale versions. Interface alignment with Sangyoon (merchant/commerce backend) has already happened directly between the two of you; the parts of that alignment TIM's code needs to act on are inlined in `docs/AGENT_SPEC.md` §2.

## What this is

Visa Commerce: a conversational commerce platform where one consumer-facing AI agent (TIM's scope) understands natural-language shopping intent, queries multiple MCP-onboarded SME merchants (Sangyoon's scope) through a standardized protocol, and drives the consumer to one recommended, confirmed, paid transaction inside a single chat — never a redirect to a merchant's own checkout.

## Doc map

| File                  | Answers                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/AGENT_SPEC.md`  | How the agent thinks: intent extraction, mode detection, ranking/tiebreak logic, clarification, MCP call rules, merchant interface shapes. |
| `docs/CONSUMER_UX.md` | How it looks: screens, components, copy, slash commands.                                                                                   |
| `docs/TASKS.md`       | Build checklist, in order, with exit criteria.                                                                                             |

**Surface:** web chat, built and demoed first. Telegram is a later phase — see `docs/AGENT_SPEC.md` header note on why this isn't blocked by Sangyoon's integration doc mentioning Telegram.

## Non-negotiable rules

1. Only MCP-onboarded merchants are ever searched or shown. No external, aggregator, or scraped results, under any circumstance.
2. Hard constraints (budget, a stated required feature, an explicit deadline) are filtered **deterministically**, in plain code, and independently re-checked against the model's own tool results even though tool orchestration itself is agentic — see `docs/AGENT_SPEC.md` §4. An LLM's own reasoning never overrides a hard constraint, no matter how reasonable it sounds.
3. The final-decision call may use LLM reasoning, but only over the real `Offer[]` data returned by MCP. Never fabricate a price, attribute, description claim, stock level, or an offer that wasn't actually returned.
4. The final-decision call runs at temperature 0 and must return a structured object referencing real offer IDs — never free text as the primary output.
5. A recommendation is never authorization. The user takes one explicit confirm action before any order is created, and that action is what sets `userConfirmed: true` — the actual field the backend validates.
6. The LLM never infers consent from conversational tone or casual language — only the explicit UI action counts.
7. The consumer never sees raw JSON or a payload dump. Intent, offers, and recommendations are always rendered through the components defined in `docs/CONSUMER_UX.md`.
8. No category schema is hardcoded as a fixed list of "important" attributes ahead of time — see `docs/AGENT_SPEC.md` §6.
9. Payment execution is Sangyoon's real `create_order`/`initiate_payment` tools, called directly per `docs/AGENT_SPEC.md` §2 — both are approval-gated at the API level in addition to the UI confirmation, and both gates must be respected in code.
10. `search_products` / `request_offers` calls are always single-category. Cross-category discovery is composed from multiple single-category calls on TIM's side.
11. TIM's backend never connects to PostgreSQL and never receives `DATABASE_URL`. `OPENAI_API_KEY` lives only in TIM's backend, never in the MCP process. `COMMERCE_MCP_URL` and `COMMERCE_MCP_AUTH_TOKEN` are server-side only — never sent to any client.
12. Never send a raw PAN, CVV, PIN, or provider credential through MCP. Payment uses a saved `paymentMethodId` only, or none for the default.
13. Only `PaymentResult.status === "authorized"` counts as success. `"processing"` means poll `get_payment_status`, never assume.
14. Reuse the same `requestId` when retrying a failed or timed-out order/payment attempt — never generate a new one for the same logical operation.
