# CONSUMER_UX.md — screens, components, copy

Every component here maps 1:1 to a state or transition in `docs/AGENT_SPEC.md`. If a state exists there with no component here, that's a gap — flag it rather than improvising in code.

---

## 1. Layout

Single-column chat. No nav bar, no sidebar, no settings page required to start shopping. Input is docked at the bottom of the viewport, full width, persistent across every state including clarification and error states — never replaced by a modal or form.

## 2. Slash commands

Typing `/` opens a small filtered menu above the input (dismiss with Escape), styled after Linear/Superhuman's command palette.

| Command | Behavior |
|---|---|
| `/reset` | Clears the current intent and conversation state, returns to `idle`. Demo-pacing tool for running multiple scenarios in one session. |
| `/budget <amount>` | Sets an explicit spend guardrail for the session, independent of what's typed in a given message. Visible confirmation: *"Budget set to $[amount] for this session."* |
| `/compare` | Re-opens the full comparison view (winner + all alternatives with reasons) for the current or most recent recommendation, even after it was accepted past. |
| `/why` | Re-runs and re-displays the explanation for the last recommendation, without re-running ranking. |

No other slash commands for the demo — each of the four above earns its place against a specific rubric line (pacing, spend safety, multi-merchant visibility, transparency); anything more adds surface area without judged value.

## 3. Components, in state order

### 3.1 Welcome message (state: `idle`)
One line plus one example prompt. Copy: *"Tell me what you're looking for."* Example prompt shown as a tappable chip: *"Try: noise-cancelling headphones under $150"*.

### 3.2 User message bubble
Right-aligned, `bg-accent` fill, no avatar. Standard chat bubble, iMessage/WhatsApp rhythm.

### 3.3 Clarifying-question bubble (Mode 2a)
Left-aligned, plain agent message — visually identical to any other agent text, never a form or modal. One bundled question per turn, and when the need is still fuzzy, the question includes a short illustrative suggestion to help the user think it through (e.g. "...are you thinking something like a one-time service, or ongoing support?") — see `AGENT_SPEC.md` §4 Layer 3. These illustrative examples are phrased as possibilities ("something like…"), never as claims about real inventory — visually there's no difference from a plain question, the distinction is purely in the copy's phrasing.

### 3.4 Direction cards (Mode 2b)
Up to 3 cards shown together, each representing a distinct product type/direction (never variants of the same item). Each card: one line name, one line description, tappable. Selecting one resolves `productType` and continues the flow.

### 3.5 Intent chip row
Appears once Layer 2 resolves to Mode 1, immediately above the "searching" status line. Small pill-style tags, one per resolved field (e.g. `Nike` `US 9` `Under $180` `Today`), plus a small edit affordance. This is the transparency moment — the user sees exactly what the agent understood before it acts, and can correct it before search fires. Never rendered as JSON or a form.

### 3.6 Searching status line
Plain muted text, not a spinner-only state. Examples: *"Checking a few merchants…"*, *"Comparing offers…"*. Never fake chain-of-thought detail.

### 3.7 Tiebreak question bubble
Appears only when `AGENT_SPEC.md` §5 Step E/F trigger it — meaning two or more offers are genuinely tied (no single offer wins on everything). Same visual treatment as any agent message — a single question, plain-text reply expected, never multiple choice buttons. The question is always about a real attribute the returned offers actually differ on, never a generic or invented one.

### 3.8 Comparison view
One winner card: `border: 2px solid var(--border-accent)`, "Recommended" badge (`bg-accent` / `text-accent`, 12px, top-right of card), merchant name, and a one-line summary appropriate to the category — a spec highlight for electronics (e.g. "RTX-class GPU, 32GB RAM"), or a description snippet for professional services (e.g. "Individual tax return preparation"). Below it, every other valid offer collapses to a single row — no card treatment — showing merchant name and its specific non-selection reason in muted text (never a generic "rejected"). Winner always renders first.

### 3.9 Transaction preview
Fixed-shape card, non-editable: product/service, merchant, exact `offeredPrice`, delivery or scheduling detail. Exactly one primary button: **"Confirm & authorize."** No payment method selection here — a saved default is used automatically per `AGENT_SPEC.md` §2.

### 3.10 Confirmation gesture
Opens on tapping "Confirm & authorize" — a single, lightweight visual moment (icon + one line, e.g. "Authorizing purchase…"), resolving quickly. This is a pure purchase-confirmation gesture, not a payment-method or identity-document flow — no card is chosen here, since a saved default handles that. Its role is to be the unambiguous, unmissable moment before `userConfirmed: true` is set and `create_order` fires.

### 3.11 Payment result
Explicit state, never ambiguous: *"Payment authorized — [merchant] is preparing your order."* or *"Payment declined. Try a different card or offer."* No silent success assumed.

## 4. Design language references

Real apps used as interaction-pattern references only — not asset or content reuse:

- **Chat surface** — iMessage/WhatsApp bubble rhythm.
- **Slash commands** — Linear / Superhuman command palette.
- **Comparison cards** — Airbnb / Booking.com listing convention (one featured, others quiet).
- **Transaction preview + confirm** — Apple Pay / Stripe Checkout single-screen-of-truth.
- **Identity check** — Venmo / Apple Pay biometric-tap convention.

## 5. Copy conventions

- Sentence case everywhere. No title case, no all-caps.
- No "please" — the UI isn't asking a favor ("Enter a budget," not "Please enter a budget").
- Errors state what happened, then what to do, in one sentence — never a raw exception string, never "Error:" prefixed.
- No exclamation marks in system copy.
- Buttons: verb first, 1–3 words ("Confirm & authorize," not "OK" or "Submit").
