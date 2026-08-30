# TASKS.md — build checklist

Build in this order. Each item's exit criteria should be checkable without re-reading `AGENT_SPEC.md`.

- [ ] **0. Required-field lookup** — create `local-config/required-fields.json` with the two seeded categories (`AGENT_SPEC.md` §3). *Exit: file exists, code reads it for both `electronics` and `professional_services`.*
- [ ] **1. Layer 1 extraction call** — one LLM call, no tools attached, raw message → draft intent + `categoryCandidates`. *Exit: both fixtures' opening messages produce the expected draft intent.*
- [ ] **2. Layer 2 completeness check** — pure code, no LLM. *Exit: both fixtures route to their documented Mode.*
- [ ] **3. Mode 2a loop with refinement suggestions** — bundled single question with an illustrative suggestion when fuzzy, phrased as a possibility not a promise. *Exit: Fixture B's question and two-turn exchange resolve correctly.*
- [ ] **4. Mode 2b loop** — up to 2 single-category `search_products` calls, real grounded direction cards. *Exit: an ambiguous test message produces 2 real direction cards.*
- [ ] **5. OpenAI Responses API `mcp` tool wiring** — the real 7-tool config from `AGENT_SPEC.md` §2, `require_approval.never` on the five read tools only, tools attached to the turn only after Mode 1 is reached (§4). *Exit: a live turn against seeded merchant data successfully calls `request_offers` and returns real offers for both categories, and attempting a tool-enabled turn before Mode 1 is reached is not possible in the code path.*
- [ ] **6. Post-hoc deterministic validation** — after each Layer-4 turn, extract the `mcp_tool_result` for `request_offers` from the response content, independently re-run the hard filter against it (`AGENT_SPEC.md` §4, §6 Step A). *Exit: feeding a turn where the model's own reasoning picked an over-budget offer causes TIM's backend to reject that output before it reaches the user.*
- [ ] **7. Step B final-decision call, electronics branch** — LLM call, temperature 0, reasons over each offer's `attributes` bag. *Exit: Fixture A selects the strongest video-editing laptop using only real spec values; rerun three times, same selection each time.*
- [ ] **8. Step B final-decision call, professional_services branch** — reasons over `description`/`durationType`/price, semantic matching. *Exit: Fixture B excludes the bookkeeping-focused service despite it passing the hard filter, with plain-language reasoning grounded in the actual description text.*
- [ ] **9. Clarifying-question resolution** — one question max, second pass must return a final `selectedOfferId`. *Exit: a genuinely tied electronics case produces exactly one question, never zero or two.*
- [ ] **10. Intent chip row + edit affordance** (UX §3.5). *Exit: editing a chip correctly re-triggers Layer 2.*
- [ ] **11. Comparison view** (UX §3.8). *Exit: both fixtures render correctly, category-appropriate summary line.*
- [ ] **12. Transaction preview** (UX §3.9). *Exit: fields match the selected offer exactly, no recomputation, no payment-method selector shown.*
- [ ] **13. Confirmation gesture + `create_order`** (UX §3.10, `AGENT_SPEC.md` §10) — assembles `OrderRequest` with `userConfirmed: true` and a freshly generated `requestId`, handles the API-level approval interrupt. *Exit: tapping "Confirm & authorize" results in a real `create_order` call with the correct payload shape.*
- [ ] **14. `initiate_payment` + `get_payment_status` polling** — real call, `paymentMethodId` optional, handles `"processing"` by polling rather than assuming a result. *Exit: an authorized, a declined, and a processing-then-resolved case each render correctly.*
- [ ] **15. Offer-freshness handling** — `OFFER_EXPIRED`/`PRICE_CHANGED` triggers a fresh offer fetch and a new required confirmation, never a silent proceed. *Exit: Fixture C's stale-offer scenario re-shows an updated transaction preview and blocks on a fresh tap.*
- [ ] **16. Idempotency** — same `requestId` reused on retry of the same logical order/payment attempt. *Exit: simulating a timeout-then-retry on `create_order` shows the identical `requestId` in both calls.*
- [ ] **17. MCP error-code handling** — `VALIDATION_ERROR`, `OUT_OF_STOCK`, `PAYMENT_FAILED` handled per `AGENT_SPEC.md` §8's table. *Exit: each code, triggered against seeded data, produces its documented behavior and never gets reinterpreted as success.*
- [ ] **18. Slash commands** — `/reset`, `/budget`, `/compare`, `/why`. *Exit: each behaves per UX §2.*
- [ ] **19. Security boundary check** — confirm no `DATABASE_URL`, `OPENAI_API_KEY` outside TIM's backend, and no `COMMERCE_MCP_URL`/`COMMERCE_MCP_AUTH_TOKEN` ever reach a client response or client-side bundle. *Exit: grep the built client bundle for these strings — none found.*
- [ ] **20. Demo rehearsal** — run both canonical fixtures plus Fixture C at least 3 times each against real seeded merchant data. *Exit: no fixture produces a different winner, a different exclusion reasoning, or a different `requestId` behavior across runs.*

## Stretch, only after 0–20 are done

- [ ] **21. Telegram surface** — confirm with Sangyoon first whether this was ever required for the submission or just his own test client; build only after that answer.
