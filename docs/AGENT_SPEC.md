# AGENT_SPEC.md — consumer agent behavior

Governs everything the agent decides before a transaction is confirmed. Read `CLAUDE.md` first for the non-negotiable rules — they are not repeated here. This file is self-contained: no other contract document exists in this project.

**Surface decision:** build and demo the Web Chat first. Telegram is a later transport adapter over the same API and Agent session flow; it is not required for the current submission surface. Nothing in the Agent pipeline depends on which client renders it.

---

## 1. Vocabulary

- **Category** — a canonical category ID from the live Merchant catalog, such as `retail_goods.electronics.laptops`, `services_subscriptions.professional_services`, or `bookings.activities`. The Agent receives only active categories that currently contain active Merchant products; it does not maintain a separate hardcoded enum.
- **Hard constraint** — a field that gates search: budget, an explicitly stated required feature, an explicit delivery/scheduling deadline.
- **Refinement suggestion** — a short illustrative example the agent offers while still narrowing intent, to help the user articulate a fuzzy need. Conversational aid, not a promise — see §5 Layer 3.
- **UserIntent** — the structured payload built from a user's message (shape in §2).
- **Offer** — authoritative merchant-returned pricing/availability, from `request_offers`. Read-only.
- **Final-decision call** — the single category-aware, grounded LLM reasoning step that picks the best-matching offer when more than one survives the hard filter. See §6.

---

## 2. Interface with the merchant backend

This reflects Sangyoon's actual integration handoff. Treat every detail here as fact, not proposal.

**Transport:** TIM's backend calls the OpenAI Responses API with an `mcp` tool pointed at Sangyoon's Streamable HTTP endpoint. TIM's server never talks to PostgreSQL directly and never receives `DATABASE_URL`. `OPENAI_API_KEY` lives only in TIM's backend, never in the MCP process. `COMMERCE_MCP_URL` and `COMMERCE_MCP_AUTH_TOKEN` are server-side environment only — never sent to any client, web or Telegram.

```ts
const commerceMcpTool = {
  type: "mcp" as const,
  server_label: "visa_commerce",
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
```

`create_order` and `initiate_payment` are deliberately left out of the `never` list — they stay approval-gated at the API level. This is one of two independent layers that prevent an un-confirmed purchase: the API-level approval interrupt, and the Commerce domain's own required `userConfirmed: true` field on `OrderRequest` (§7). Neither substitutes for the other — both must hold.

**The seven frozen tools:**

| Tool                 | Purpose                                                        | Approval-gated? |
| -------------------- | -------------------------------------------------------------- | --------------- |
| `search_products`    | Category-scoped discovery, used in Mode 2b                     | No              |
| `get_product`        | Fetch detail on a specific product/service when more is needed | No              |
| `check_inventory`    | Confirm availability before offering                           | No              |
| `request_offers`     | Authoritative pricing/availability for a resolved intent       | No              |
| `create_order`       | Creates the order once the user has explicitly confirmed       | Yes             |
| `initiate_payment`   | Executes payment against a saved method                        | Yes             |
| `get_payment_status` | Polls or recovers payment state                                | No              |

**UserIntent (built by TIM, sent to `request_offers`):**

```
{
  query: string,
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings",
  categoryId: string,
  budgetMax: number,
  currency: "SGD",
  productAttributes: Record<string, string>,   // canonical names only — "size", "storage", "date" — never a merchant's raw CSV header
  deliveryDeadline: string | null,
  quantity: number,
  brandPreferences: string[],
  deliveryLocation: string | null
}
```

**Offer (returned by `request_offers`, read-only)** — one shared grounded shape for retail goods, services/subscriptions, and bookings. Category-specific product and variant details are carried in the canonical `attributes` bag; the offer also includes price, inventory, Merchant, and delivery/schedule data.

**OrderRequest (built by TIM after confirmation):**

```
{
  offerId: string,
  quantity: number,
  userConfirmed: true,       // corrected field name — this is what create_order actually validates
  requestId: string          // generated once per attempt, reused verbatim on any retry of the same operation
}
```

**PaymentRequest (built by TIM, sent to `initiate_payment`):**

```
{
  orderId: string,
  paymentMethodId?: string,  // a saved method id — omit to use the user's confirmed default. Never a raw card number, CVV, or PIN.
  requestId: string          // same idempotency rule as above
}
```

**PaymentResult:**

```
{
  status: "authorized" | "declined" | "processing",
  reference?: string
}
```

Only `status === "authorized"` counts as successful payment. `"processing"` means poll `get_payment_status` rather than assuming success or failure.

---

## 3. Required-field lookup (TIM-owned, local, no external dependency)

`local-config/required-fields.json` has a `"*"` fallback requiring `budgetMax`, plus category-specific shopping constraints where the user must choose a variant or slot before offers can be meaningful (currently shoe `size`, smartphone `storage`, and activity `date`). Any attribute name used here or in `requiredAttributes` must be canonical, never a merchant's own catalog header.

---

## 4. Reconciling determinism with an agentic tool loop

Sangyoon's integration exposes all five read-only tools to the model with `require_approval: never`, meaning the model can call `search_products`, `get_product`, `check_inventory`, and `request_offers` somewhat autonomously within a single turn, rather than TIM's backend calling each one as a separately orchestrated step. This changes how the non-negotiable determinism rules in `CLAUDE.md` get enforced — not what they require.

**The enforcement mechanism:** after the Responses API call returns, TIM's backend inspects the turn's content blocks for the `mcp_tool_result` matching `request_offers`, extracts the actual `Offer[]` it contains, and independently re-runs the deterministic hard filter (§6 Step A) against that exact data — regardless of what the model already reasoned about it. If the model's proposed `selectedOfferId` isn't in the independently-recomputed valid set, TIM's backend rejects that turn's output and either re-prompts the model with the specific violation named, or overrides it directly. This is what keeps "hard constraints are never LLM-decided" true even though tool orchestration itself is agentic — the model may explore freely, but nothing reaches the user without a code-level check on the specific numbers that matter.

Layers 1–2 (extraction, mode/completeness check) still run as TIM's own explicit steps _before_ the model is given tool access for a turn — the model isn't handed the MCP tools at all until an intent has cleared Layer 2, so it can't call `request_offers` on an incomplete intent in the first place.

---

## 5. Pipeline layers

### Layer 1 — Extraction (LLM call, one per user turn, no tools attached yet)

Raw message + recent turns + live populated categories → draft `UserIntent` + `categoryCandidates: string[]` (0, 1, or up to 3 exact canonical category IDs).

### Layer 2 — Deterministic completeness check (plain code, no LLM)

```
if categoryCandidates.length != 1 → MODE = category_discovery           // 2b
else:
  resolve category; look up required fields
  if any required field missing → MODE = attribute_discovery            // 2a
  else → MODE = directed                                                // 1
```

### Layer 3 — Branch handling, with refinement suggestions

- **Mode 1:** intent is complete. Proceed to Layer 4.
- **Mode 2a:** ask one bundled question, including an illustrative suggestion when the need is fuzzy ("...something like a one-time service, or ongoing support?"). These suggestions are general knowledge, not grounded in a real search — phrase them as possibilities, never as claims about inventory. Loop until Mode 1.
- **Mode 2b:** call `search_products` once per candidate category (max 3), present up to 3 real, grounded direction cards. User's reply resolves the category. Re-enter Layer 2.

### Layer 4 — Tool-enabled turn

Only once Mode 1 is reached, the model is given the MCP tool set (§2) for this turn. It may call `get_product` and/or `check_inventory` first if more detail is genuinely needed before `request_offers` — this is the model's judgment call within the turn, not a separately orchestrated step, since these reads are approval-free and low-risk. It then calls `request_offers`.

---

## 6. Hard filter + category-aware final decision

### Step A — Deterministic hard filter (plain code, independently re-run per §4)

Reject any offer violating budget, a stated required feature, a stated deadline, or availability. Reason codes: `OVER_BUDGET`, `MISSING_REQUIRED_FEATURE`, `MISSED_DEADLINE`, `UNAVAILABLE`. Zero survivors → "no participating merchant currently has this," never a non-MCP fallback. Exactly one survivor → that's the recommendation, no further comparison.

### Step B — Final-decision call (LLM, temperature 0), category-aware

The same grounded decision path supports every Merchant category. It receives the canonical category ID and reasons only over real `productName`, `attributes`, price, Merchant, availability, and delivery/schedule data, weighting the fields relevant to the user's request. Structured output only; `askClarifyingQuestion` is allowed only when the real offers are genuinely tied.

---

## 7. Offer freshness and idempotency

- **Stale offer:** if `request_offers` or `create_order` returns `OFFER_EXPIRED` or `PRICE_CHANGED`, never proceed on the old numbers — fetch a fresh offer and show the user a new transaction preview to reconfirm, even if the difference is small. A silently-updated price is a trust violation regardless of direction.
- **Idempotency:** generate one `requestId` per order/payment _attempt_. If retrying the same attempt (a timeout, a transient failure), reuse the exact same `requestId` — never generate a new one for what is logically the same operation. Sangyoon's backend depends on this to avoid double-charging or duplicate orders.

## 8. MCP error handling

| Code                              | Required behavior                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                | Correct the input client-side and retry — this means TIM's own payload was malformed. |
| `OFFER_EXPIRED` / `PRICE_CHANGED` | Fetch a fresh offer, reconfirm with the user before proceeding.                       |
| `OUT_OF_STOCK`                    | Recommend a different valid offer — never retry the same one.                         |
| `PAYMENT_FAILED`                  | Retry only if the response explicitly marks it retryable; otherwise show the decline. |

Never reinterpret any MCP error as a successful order or payment, under any circumstance.

---

## 9. State machine

```
idle
  → collecting_intent        (Layers 1–3, no tools attached yet)
  → intent_ready              (tools attached, Layer 4 begins)
  → searching                 (model may call get_product/check_inventory, then request_offers)
  → evaluating_offers         (Step A independently re-run, then Step B)
  → awaiting_preference        (only if Step B asked a question)
  → recommendation_ready
  → awaiting_confirmation
  → confirmed                  (userConfirmed: true assembled, create_order called — approval-gated)
  → payment_pending             (initiate_payment called — approval-gated; poll get_payment_status if "processing")
  → completed
```

---

## 10. Confirmation boundary

- Transaction preview shows product/service, merchant, exact `offeredPrice`, delivery/scheduling detail, one primary action: **"Confirm & authorize."** No payment method is chosen here — the user's saved default `paymentMethodId` is used automatically unless a specific one is already on file as preferred; this step is pure purchase confirmation, not card selection.
- That action is what sets `userConfirmed: true` in the assembled `OrderRequest` — this is the field the backend actually validates, not an invented identity flag.
- Two independent gates now stand between this tap and money moving: the UI confirmation itself, and the API-level approval interrupt on `create_order`/`initiate_payment` (§2). Both must be respected in code — do not treat the UI tap as sufficient to skip handling the approval interrupt, or vice versa.
- `initiate_payment` may return `"processing"` — in that case, poll `get_payment_status` rather than showing a result yet.

---

## 11. Canonical example fixtures

Fixtures A (laptop, spec-based decision) and B (professional services, refinement suggestion + semantic decision) remain canonical scenarios. The expanded category suite also verifies shoes, smartphones, digital products, and bookings through the same pipeline. One additional transaction fixture:

### Fixture C — offer goes stale mid-confirmation

- User completes Fixture A's flow through the transaction preview.
- Before confirmation, `create_order` returns `PRICE_CHANGED` (the merchant updated pricing).
- Agent does not silently proceed. It calls `request_offers` again, shows an updated transaction preview with the new price clearly marked as changed, and requires a fresh explicit confirmation — the original tap does not carry over.

---

## 12. Pending inputs

None remain as external blockers. The current submission surface is Web Chat. Telegram remains an explicit post-Web stretch item.
