# TASKS.md — build checklist

Build in this order. Each item's exit criteria should be checkable without re-reading `AGENT_SPEC.md`.

- [ ] **0. Required-field lookup** — maintain `local-config/required-fields.json` with a catalog-wide fallback plus canonical category overrides (`AGENT_SPEC.md` §3). _Exit: every live category requires a budget, while configured variant/slot constraints such as shoe size, phone storage, and activity date are enforced._
- [ ] **1. Layer 1 extraction call** — one LLM call, no tools attached, raw message → draft intent + `categoryCandidates`. _Exit: both fixtures' opening messages produce the expected draft intent._
- [ ] **2. Layer 2 completeness check** — pure code, no LLM. _Exit: both fixtures route to their documented Mode._
- [ ] **3. Mode 2a loop with refinement suggestions** — bundled single question with an illustrative suggestion when fuzzy, phrased as a possibility not a promise. _Exit: Fixture B's question and two-turn exchange resolve correctly._
- [ ] **4. Mode 2b loop** — up to 3 live-category `search_products` calls, real grounded direction cards. _Exit: ambiguous category IDs are selected from the populated Merchant catalog and produce up to 3 real direction cards._
- [ ] **5. OpenAI Responses API `mcp` tool wiring** — the real 7-tool config from `AGENT_SPEC.md` §2, `require_approval.never` on the five read tools only, tools attached to the turn only after Mode 1 is reached (§4). _Exit: a live turn against seeded merchant data successfully calls `request_offers` and returns real offers for both categories, and attempting a tool-enabled turn before Mode 1 is reached is not possible in the code path._
- [ ] **6. Post-hoc deterministic validation** — after each Layer-4 turn, extract the `mcp_tool_result` for `request_offers` from the response content, independently re-run the hard filter against it (`AGENT_SPEC.md` §4, §6 Step A). _Exit: feeding a turn where the model's own reasoning picked an over-budget offer causes TIM's backend to reject that output before it reaches the user._
- [ ] **7. Step B category-aware final-decision call** — LLM call, temperature 0, reasons over the canonical category and each offer's real name, `attributes`, price, Merchant, availability, and fulfillment data. _Exit: retail, service/subscription, and booking fixtures all select only from the grounded surviving offers._
- [ ] **8. Dynamic category coverage** — extraction receives live populated Merchant categories and downstream code accepts their canonical IDs without adding category-specific Agent branches. _Exit: adding an active product in a supported category makes it discoverable without changing the Agent's category enum._
- [ ] **9. Clarifying-question resolution** — one question max, second pass must return a final `selectedOfferId`. _Exit: a genuinely tied electronics case produces exactly one question, never zero or two._
- [ ] **10. Intent chip row + edit affordance** (UX §3.5). _Exit: editing a chip correctly re-triggers Layer 2._
- [ ] **11. Comparison view** (UX §3.8). _Exit: both fixtures render correctly, category-appropriate summary line._
- [ ] **12. Transaction preview** (UX §3.9). _Exit: fields match the selected offer exactly, no recomputation, no payment-method selector shown._
- [ ] **13. Confirmation gesture + `create_order`** (UX §3.10, `AGENT_SPEC.md` §10) — assembles `OrderRequest` with `userConfirmed: true` and a freshly generated `requestId`, handles the API-level approval interrupt. _Exit: tapping "Confirm & authorize" results in a real `create_order` call with the correct payload shape._
- [ ] **14. `initiate_payment` + `get_payment_status` polling** — real call, `paymentMethodId` optional, handles `"processing"` by polling rather than assuming a result. _Exit: an authorized, a declined, and a processing-then-resolved case each render correctly._
- [ ] **15. Offer-freshness handling** — `OFFER_EXPIRED`/`PRICE_CHANGED` triggers a fresh offer fetch and a new required confirmation, never a silent proceed. _Exit: Fixture C's stale-offer scenario re-shows an updated transaction preview and blocks on a fresh tap._
- [ ] **16. Idempotency** — same `requestId` reused on retry of the same logical order/payment attempt. _Exit: simulating a timeout-then-retry on `create_order` shows the identical `requestId` in both calls._
- [ ] **17. MCP error-code handling** — `VALIDATION_ERROR`, `OUT_OF_STOCK`, `PAYMENT_FAILED` handled per `AGENT_SPEC.md` §8's table. _Exit: each code, triggered against seeded data, produces its documented behavior and never gets reinterpreted as success._
- [ ] **18. Slash commands** — `/reset`, `/budget`, `/compare`, `/why`. _Exit: each behaves per UX §2._
- [ ] **19. Security boundary check** — confirm no `DATABASE_URL`, `OPENAI_API_KEY` outside TIM's backend, and no `COMMERCE_MCP_URL`/`COMMERCE_MCP_AUTH_TOKEN` ever reach a client response or client-side bundle. _Exit: grep the built client bundle for these strings — none found._
- [ ] **20. Demo rehearsal** — run both canonical fixtures plus Fixture C at least 3 times each against real seeded merchant data. _Exit: no fixture produces a different winner, a different exclusion reasoning, or a different `requestId` behavior across runs._

## Stretch, only after 0–20 are done

- [ ] **21. Telegram surface** — add only after the Web Chat submission flow is complete, reusing the same API and Agent session logic.
