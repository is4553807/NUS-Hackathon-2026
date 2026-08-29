# Saved Payment and Agent Checkout

## User experience

The user registers a card once through a trusted payment setup surface. During shopping, a natural-language instruction such as "Buy this one" is the transaction-specific confirmation. The Agent creates the confirmed Order and immediately requests payment with the user's default saved method. There is no card re-entry, CVV prompt, checkout redirect, or second confirmation button in the normal path.

The challenge still requires consent before an Agent transacts. Therefore the system does not silently purchase based only on an earlier general preference: the current Order must contain `userConfirmed: true`, the selected Offer, amount, quantity, and delivery context. A price or inventory change invalidates that confirmation.

## Security boundary

```text
OpenAI / Telegram
  knows: orderId, paymentMethodId, PaymentResult
  never knows: PAN, CVV, provider credential reference

Commerce backend
  verifies: confirmation, user ownership, expiry, idempotency, amount
  resolves: PaymentMethod -> backend-only provider/vault reference

Payment adapter
  receives: server-owned amount and provider/vault reference
  returns: authorization decision
```

`PaymentMethod` stores a user ID, safe display metadata, and a backend-only provider credential reference. The `Payment` audit row stores the selected `paymentMethodId` and a SHA-256 fingerprint of that reference. Raw card numbers and CVVs are neither accepted nor stored.

For a production integration, initial card capture should use a PCI-compliant provider-hosted field or SDK. The provider returns a vault/payment-method reference to the trusted backend. The model never participates in card capture.

## API flow

After `create_order` returns `payment_pending`, call:

```json
{
  "requestId": "d74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
  "orderId": "c548d08f-3b72-4ef3-875b-b0eb8439dcf9",
  "paymentMethod": "mock_visa"
}
```

Omitting `paymentMethodId` uses the Order user's default saved method. A safe ID may be supplied when the user chooses another saved method:

```json
{
  "requestId": "d74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
  "orderId": "c548d08f-3b72-4ef3-875b-b0eb8439dcf9",
  "paymentMethod": "mock_visa",
  "paymentMethodId": "e2222222-2222-4222-8222-222222222222"
}
```

## Mock Visa outcomes

The seed creates four backend-only test methods for the demo user. Their provider references drive deterministic outcomes:

| Saved method ID                        | Result                  | Order/inventory effect                        |
| -------------------------------------- | ----------------------- | --------------------------------------------- |
| `e1111111-1111-4111-8111-111111111111` | `authorized`            | Order becomes `paid`; reservation is consumed |
| `e2222222-2222-4222-8222-222222222222` | `declined`              | Order fails; reservation is released          |
| `e3333333-3333-4333-8333-333333333333` | `requires_verification` | Order and reservation remain pending          |
| `e4444444-4444-4444-8444-444444444444` | `failed`                | Order fails; reservation is released          |

Only the first method is the default. These IDs are test references, not card credentials.

## State and replay safeguards

- The payment amount and currency come exclusively from the Order.
- `requestId` is unique. Retrying the same logical request returns the original Payment.
- A partial unique database index permits only one active Payment per Order.
- A saved method must belong to the Order user, be active, and not be expired.
- Only `authorized` changes an Order to `paid`.
- Declines and processor failures release reserved inventory exactly once.
- `requires_verification` is not success and does not release the reservation.

Visa's Trusted Agent Protocol can later add cryptographic proof that a recognized Agent is acting for a particular consumer and transaction purpose. The current prototype keeps this as a future adapter boundary; it does not claim production Visa Trusted Agent certification. Visa describes the protocol as time-bound, replay-resistant proof of agent identity and transaction-specific authorization: [Visa Trusted Agent Protocol](https://developer.visa.com/use-cases/trusted-agent-protocol).

The mock gateway can later be replaced behind `PaymentGateway` with an approved payment processor or Visa acceptance integration. Production Visa acceptance access, authentication, encryption, certification, and acquirer approval depend on the selected Visa product: [VisaNet Connect - Acceptance](https://developer.visa.com/capabilities/visanet-connect-acceptance/docs-getting-started).
