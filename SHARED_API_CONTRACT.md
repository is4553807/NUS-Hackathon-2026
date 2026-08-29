# Visa x NUS Hackathon - Shared API Contract v1.0

> Status: **Frozen for MVP**  
> Owners: **SANGYOON (Merchant, Commerce, and MCP)** and **TIM (Consumer, Agent, and Telegram)**  
> Last updated: 2026-08-29  
> REST base path: `/v1`

This document defines the integration boundary between TIM's agent-facing applications and SANGYOON's commerce backend.

The following four objects and the public API names in this document are frozen for MVP development:

1. `UserIntent`
2. `Offer`
3. `OrderRequest`
4. `PaymentResult`

Backward-compatible optional fields may be added with agreement from both owners. Removing fields, renaming fields, or changing field types requires a new contract version.

---

## 1. Source of Truth

During repository initialization, the Zod schemas in `packages/contracts` must implement this document. Once those schemas exist, they become the executable source of truth and TypeScript types must be inferred from them.

```ts
export const ExampleSchema = z.object({});
export type Example = z.infer<typeof ExampleSchema>;
```

Rules:

- `packages/contracts` may depend only on Zod.
- Transport objects use `camelCase` field names.
- Database columns may use `snake_case` and map to the transport objects in the domain layer.
- HTTP routes, MCP tools, UI components, and Telegram handlers must not define competing versions of these contracts.

---

## 2. Ownership Boundary

### TIM

- Convert a natural-language request into a valid `UserIntent`.
- Ask the user for missing required information before calling commerce tools.
- Compare the returned `Offer[]` and explain the recommendation.
- Show a transaction preview and obtain explicit user confirmation.
- Send an `OrderRequest` only after confirmation.
- Display the final `PaymentResult`.

### SANGYOON

- Validate products, variants, inventory, delivery, and pricing policies.
- Generate only offers that comply with merchant policy.
- Revalidate offer expiry, inventory, price, and confirmation before creating an order.
- Run the mock Visa payment flow and return a `PaymentResult`.
- Never store or return raw card numbers or CVVs.

### Core principle

> The agent interprets intent and recommends a transaction. The commerce backend is the final authority for price, inventory, orders, and payments.

---

## 3. Common Conventions

### 3.1 Data format

- Requests and responses use JSON.
- All IDs are UUID strings.
- All timestamps use ISO 8601 with a timezone offset.
  - Valid: `2026-08-29T18:00:00+08:00`
  - Invalid: `today`, `6pm`, `2026-08-29 18:00`
- Monetary values are JSON numbers and are stored as `DECIMAL(12,2)` in the backend.
- Currency values use three-letter ISO 4217 codes. MVP supports `SGD`.
- Status values use the lowercase `snake_case` values defined in this document.
- Clients treat IDs as opaque strings and never infer meaning from their format.

### 3.2 Security

The following values must never appear in shared objects, application logs, or the project database:

- Raw card number or PAN
- CVV or CVC
- Card PIN
- Full payment authentication credentials

Only mock tokens, provider-issued tokens, or non-sensitive payment references may be stored.

### 3.3 Shared primitive types

```ts
type CurrencyCode = "SGD";

type ProductCategory =
  "physical_goods" | "digital_products" | "services" | "bookings_experiences";

type ProductAttributeValue = string | number | boolean;

type ProductAttributes = Record<string, ProductAttributeValue>;
```

### 3.4 Fixed MVP product categories

| UI label               | API and database value | Category-specific details                                                                  |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| Physical Goods         | `physical_goods`       | SKU, sizes, colors, material, weight, dimensions, and shipping requirement                 |
| Digital Products       | `digital_products`     | Delivery method, file format/size, version, licence, and access duration                   |
| Services               | `services`             | Service type, delivery mode, duration, location/service areas, and provider                |
| Bookings & Experiences | `bookings_experiences` | Experience type, destination, venue, start/end time, timezone, capacity, and meeting point |

These four values are the complete MVP top-level taxonomy. A narrower concern such as
`basketball_shoes` is a product attribute, not another top-level category.

---

## 4. Frozen Object 1 - `UserIntent`

**Direction:** TIM -> SANGYOON/MCP

`UserIntent` is the structured version of a user's purchase request.

### 4.1 TypeScript definition

```ts
type UserIntent = {
  intentId: string;
  category: ProductCategory;
  budgetMax: number;
  currency: CurrencyCode;
  quantity: number;
  brandPreferences: string[];
  productAttributes: ProductAttributes;
  deliveryLocation: string | null;
  deliveryDeadline: string | null;
};
```

### 4.2 Validation rules

- `intentId`, `category`, `budgetMax`, `currency`, and `quantity` are required.
- `category` must be one of `physical_goods`, `digital_products`, `services`, or `bookings_experiences`.
- `intentId` must be a UUID.
- `budgetMax` must be greater than zero.
- `quantity` must be an integer greater than or equal to one.
- Use `[]` when there is no brand preference.
- Use `{}` when there are no required product attributes.
- If the user gives a relative deadline such as `today`, TIM converts it to an absolute timestamp before calling the backend.
- If a category requires an attribute such as shoe size, TIM asks for it before requesting offers.

### 4.3 Example

```json
{
  "intentId": "4f7a347c-3f30-4db0-9f85-3b6e9f182116",
  "category": "physical_goods",
  "budgetMax": 180.0,
  "currency": "SGD",
  "quantity": 1,
  "brandPreferences": ["Nike"],
  "productAttributes": {
    "size": "US 9"
  },
  "deliveryLocation": "NUS",
  "deliveryDeadline": "2026-08-29T18:00:00+08:00"
}
```

---

## 5. Frozen Object 2 - `Offer`

**Direction:** SANGYOON/MCP -> TIM

An `Offer` is a time-limited transaction that can currently be completed for a specific user intent. It is not static catalog data.

### 5.1 TypeScript definition

```ts
type OfferStatus = "active" | "expired" | "accepted" | "cancelled";

type Offer = {
  offerId: string;
  intentId: string;

  merchantId: string;
  merchantName: string;

  productId: string;
  productName: string;

  listedPrice: number;
  offeredPrice: number;
  currency: CurrencyCode;
  quantity: number;

  quantityAvailable: number;
  attributes: ProductAttributes;

  deliveryAvailable: boolean;
  deliveryEstimate: string | null;

  status: OfferStatus;
  expiresAt: string;

  priceExplanation: string;
};
```

### 5.2 Validation rules

- `offeredPrice` must be less than or equal to `listedPrice`.
- `offeredPrice` must never be lower than the effective merchant minimum price.
- `quantityAvailable` must be greater than or equal to the requested `quantity`.
- The returned variant must match the requested `productAttributes`.
- Do not create an offer when delivery cannot satisfy the intent.
- `expiresAt` must be later than the creation time.
- TIM recommends only an offer whose `status` is `active` and whose `expiresAt` is still in the future.
- Never expose a merchant's minimum price, cost, margin, or private pricing rules.
- `priceExplanation` contains only a safe, user-facing explanation.

### 5.3 Example

```json
{
  "offerId": "97d2f034-5e97-494d-944f-63c0697d890a",
  "intentId": "4f7a347c-3f30-4db0-9f85-3b6e9f182116",
  "merchantId": "f7c5987c-f424-4e65-a65f-34fa63aa9855",
  "merchantName": "NUS Sneaker Hub",
  "productId": "e4193e0a-5638-472d-8320-b1c71ac9fb62",
  "productName": "Nike GT Cut 3",
  "listedPrice": 195.0,
  "offeredPrice": 175.0,
  "currency": "SGD",
  "quantity": 1,
  "quantityAvailable": 25,
  "attributes": {
    "size": "US 9",
    "color": "Black"
  },
  "deliveryAvailable": true,
  "deliveryEstimate": "2026-08-29T17:00:00+08:00",
  "status": "active",
  "expiresAt": "2026-08-29T14:00:00+08:00",
  "priceExplanation": "Inventory promotion applied"
}
```

---

## 6. Frozen Object 3 - `OrderRequest`

**Direction:** TIM -> SANGYOON

`OrderRequest` proves that the user reviewed the transaction preview and explicitly confirmed the purchase.

### 6.1 TypeScript definition

```ts
type ConfirmationChannel = "telegram" | "web" | "app";

type OrderRequest = {
  requestId: string;
  userId: string;
  offerId: string;
  userConfirmed: true;
  confirmedAt: string;
  confirmationChannel: ConfirmationChannel;
};
```

### 6.2 Validation rules

- `requestId`, `userId`, and `offerId` must be UUIDs.
- `userConfirmed` must be the boolean literal `true`. The string `"true"` is invalid.
- Repeated requests with the same `requestId` must return the original order instead of creating a duplicate.
- Reject a missing or unreasonably future-dated `confirmedAt` value.
- Before confirmation, TIM must show the merchant, product, variant, quantity, final amount, currency, and delivery estimate.
- Immediately before order creation, the backend revalidates:
  - Offer existence and active status
  - Offer expiry
  - Current inventory
  - Current pricing policy
  - Explicit user confirmation
- If revalidation fails, do not create an order. Return a standard error.

### 6.3 Example

```json
{
  "requestId": "c74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3",
  "userId": "643f3382-40b2-4343-b4bf-4d62d51da5fb",
  "offerId": "97d2f034-5e97-494d-944f-63c0697d890a",
  "userConfirmed": true,
  "confirmedAt": "2026-08-29T13:52:30+08:00",
  "confirmationChannel": "telegram"
}
```

---

## 7. Frozen Object 4 - `PaymentResult`

**Direction:** SANGYOON -> TIM

`PaymentResult` allows the agent to display the current payment outcome without exposing sensitive payment credentials.

### 7.1 TypeScript definition

```ts
type PaymentStatus =
  | "pending"
  | "requires_verification"
  | "authorized"
  | "declined"
  | "failed"
  | "cancelled";

type PaymentResult = {
  orderId: string;
  paymentId: string;
  provider: "Visa";
  status: PaymentStatus;
  amount: number;
  currency: CurrencyCode;
  cardholderVerified: boolean;
  authorizationReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  updatedAt: string;
};
```

### 7.2 Validation rules

- Only `authorized` is a successful payment state.
- `pending` and `requires_verification` are not successful states.
- `declined`, `failed`, and `cancelled` must have a null `authorizationReference`.
- `authorized` must have a non-null `authorizationReference`.
- `amount` and `currency` must exactly match the order.
- `failureMessage` contains only information that is safe to show to the user.
- Never return a payment token, raw card data, or gateway secret.

### 7.3 Authorized example

```json
{
  "orderId": "c548d08f-3b72-4ef3-875b-b0eb8439dcf9",
  "paymentId": "97d7ee95-8462-48e1-b9db-e8f3b69af78c",
  "provider": "Visa",
  "status": "authorized",
  "amount": 175.0,
  "currency": "SGD",
  "cardholderVerified": true,
  "authorizationReference": "AUTH-DEMO-12345",
  "failureCode": null,
  "failureMessage": null,
  "updatedAt": "2026-08-29T13:53:10+08:00"
}
```

### 7.4 Declined example

```json
{
  "orderId": "c548d08f-3b72-4ef3-875b-b0eb8439dcf9",
  "paymentId": "97d7ee95-8462-48e1-b9db-e8f3b69af78c",
  "provider": "Visa",
  "status": "declined",
  "amount": 175.0,
  "currency": "SGD",
  "cardholderVerified": true,
  "authorizationReference": null,
  "failureCode": "PAYMENT_DECLINED",
  "failureMessage": "The mock payment was declined.",
  "updatedAt": "2026-08-29T13:53:10+08:00"
}
```

---

## 8. Frozen MCP Tool and REST API Names

The earlier project specification used both `request_offer` and `request_offers`. MVP uses **`request_offers`** because one intent may produce offers from multiple merchants.

| #   | MCP tool             | REST endpoint                  | Owner    | Purpose                                                    |
| --- | -------------------- | ------------------------------ | -------- | ---------------------------------------------------------- |
| 1   | `search_products`    | `POST /v1/search`              | SANGYOON | Find product candidates matching an intent                 |
| 2   | `get_product`        | `GET /v1/products/{productId}` | SANGYOON | Read public details for one product                        |
| 3   | `check_inventory`    | `POST /v1/inventory/check`     | SANGYOON | Check current inventory for a product variant and quantity |
| 4   | `request_offers`     | `POST /v1/offers`              | SANGYOON | Create the currently valid `Offer[]` for an intent         |
| 5   | `create_order`       | `POST /v1/orders`              | SANGYOON | Create an order from a confirmed `OrderRequest`            |
| 6   | `initiate_payment`   | `POST /v1/payments`            | SANGYOON | Start a mock Visa payment for an order                     |
| 7   | `get_payment_status` | `GET /v1/payments/{paymentId}` | SANGYOON | Read the latest `PaymentResult`                            |

The registered MCP tool names must match this table exactly. Do not add aliases.

---

## 9. API Request and Response Contract

### 9.1 `search_products`

```ts
type SearchProductsRequest = {
  intent: UserIntent;
};

type ProductSearchResult = {
  productId: string;
  merchantId: string;
  merchantName: string;
  productName: string;
  brand: string | null;
  category: ProductCategory;
  listedPrice: number;
  currency: CurrencyCode;
  matchedAttributes: ProductAttributes;
};

type SearchProductsData = {
  products: ProductSearchResult[];
};
```

Search results are candidates and do not guarantee a transaction price. TIM must call `request_offers` before recommending a purchasable transaction.

### 9.2 `get_product`

```ts
type GetProductRequest = {
  productId: string;
};
```

The response contains public product and attribute data. It must not expose minimum price or private pricing policy data.

### 9.3 `check_inventory`

```ts
type CheckInventoryRequest = {
  productId: string;
  attributes: ProductAttributes;
  quantity: number;
};

type CheckInventoryData = {
  available: boolean;
  quantityAvailable: number;
  variantKey: string;
  checkedAt: string;
};
```

### 9.4 `request_offers`

```ts
type RequestOffersRequest = {
  intent: UserIntent;
};

type RequestOffersData = {
  offers: Offer[];
};
```

Return an empty `offers` array when no valid offer exists. This is not an API error.

### 9.5 `create_order`

The request body is `OrderRequest`.

```ts
type OrderStatus = "payment_pending" | "paid" | "payment_failed" | "cancelled";

type OrderResult = {
  orderId: string;
  offerId: string;
  userId: string;
  merchantId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: CurrencyCode;
  userConfirmed: true;
  status: OrderStatus;
  createdAt: string;
};
```

### 9.6 `initiate_payment`

```ts
type InitiatePaymentRequest = {
  requestId: string;
  orderId: string;
  paymentMethod: "mock_visa";
  mockPaymentToken: string;
};
```

- `requestId` is the idempotency key for payment retries.
- TIM must never send raw card data to the commerce backend.
- The success response data is `PaymentResult`.

### 9.7 `get_payment_status`

```ts
type GetPaymentStatusRequest = {
  paymentId: string;
};
```

The success response data is the latest `PaymentResult`.

---

## 10. Common Response Envelope

### 10.1 Success

```ts
type SuccessResponse<T> = {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
};
```

### 10.2 Error

```ts
type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "OFFER_EXPIRED"
  | "OUT_OF_STOCK"
  | "DELIVERY_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "CONFIRMATION_REQUIRED"
  | "ORDER_CONFLICT"
  | "IDENTITY_VERIFICATION_REQUIRED"
  | "PAYMENT_DECLINED"
  | "PAYMENT_FAILED"
  | "INTERNAL_ERROR";

type ErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
};
```

### 10.3 Error handling

| Code                             | Meaning                                          | Expected TIM action                               |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `VALIDATION_ERROR`               | Invalid field, type, or format                   | Correct the payload or collect missing input      |
| `NOT_FOUND`                      | Product, offer, order, or payment does not exist | Search again                                      |
| `OFFER_EXPIRED`                  | The selected offer expired                       | Call `request_offers` again                       |
| `OUT_OF_STOCK`                   | Current inventory is insufficient                | Recommend another offer or search again           |
| `DELIVERY_UNAVAILABLE`           | Delivery can no longer satisfy the intent        | Recommend another offer                           |
| `PRICE_CHANGED`                  | The pricing policy changed                       | Show the new price and ask for confirmation again |
| `CONFIRMATION_REQUIRED`          | Explicit user confirmation is missing            | Run the confirmation UX                           |
| `ORDER_CONFLICT`                 | A duplicate or conflicting order exists          | Read the existing order status                    |
| `IDENTITY_VERIFICATION_REQUIRED` | Payment needs verification                       | Run the mock verification step                    |
| `PAYMENT_DECLINED`               | The mock payment was declined                    | Show the failure result                           |
| `PAYMENT_FAILED`                 | Payment processing failed                        | Retry only when `retryable` is true               |
| `INTERNAL_ERROR`                 | Unexpected backend error                         | Retry later                                       |

TIM must not reinterpret backend errors as success or invent replacement price or inventory values.

---

## 11. Deterministic Offer Policy for the Demo

This section defines the deterministic business behavior implemented by the Commerce domain for the MVP.

The rule exists here so both owners can build toward the same deterministic demo result. It may later be replaced by a richer policy engine without changing the v1 transport contract.

### 11.1 Validation order

1. Confirm that the product is active.
2. Match category and brand.
3. Match the requested product attributes to a real variant.
4. Confirm `quantityAvailable - quantityReserved >= requested quantity`.
5. Confirm delivery availability and deadline.
6. Apply the pricing policy.
7. Confirm the calculated price is within the user's budget.
8. Save and return only candidates that pass every check.

### 11.2 Price calculation

```text
if negotiationEnabled is false:
    offeredPrice = listedPrice

if negotiationEnabled is true:
    if availableInventory > 20:
        inventoryDiscount = 20 SGD
    else if availableInventory < 5:
        inventoryDiscount = 5 SGD
    else:
        inventoryDiscount = 10 SGD

    allowedDiscount = inventoryDiscount

    if maxDiscountPercent is configured:
        allowedDiscount = min(
            inventoryDiscount,
            listedPrice * maxDiscountPercent / 100
        )

    candidatePrice = listedPrice - allowedDiscount
    offeredPrice = max(candidatePrice, effectiveMinimumPrice)

if offeredPrice > budgetMax:
    do not create an offer
```

Round all calculated monetary values to two decimal places.

### 11.3 Expected demo result

| Merchant | Stock | Listed price | Minimum price | Match       | Result                            |
| -------- | ----: | -----------: | ------------: | ----------- | --------------------------------- |
| A        |     2 |        S$195 |         S$190 | US 9, today | S$190 exceeds the budget; exclude |
| B        |    25 |        S$195 |         S$165 | US 9, today | Create a valid S$175 offer        |
| C        |    10 |        S$169 |         S$169 | US 8 only   | Attributes do not match; exclude  |

The response must contain one valid offer: Merchant B at S$175.

---

## 12. Merchant Management REST API

These endpoints belong to SANGYOON's domain. TIM does not call them during the consumer purchase flow.

| Operation              | REST endpoint                                         |
| ---------------------- | ----------------------------------------------------- |
| Create merchant        | `POST /v1/merchants`                                  |
| Create product         | `POST /v1/merchants/{merchantId}/products`            |
| Update product         | `PATCH /v1/products/{productId}`                      |
| Update inventory       | `PUT /v1/products/{productId}/inventory/{variantKey}` |
| Configure pricing      | `PUT /v1/products/{productId}/pricing-policy`         |
| List merchant products | `GET /v1/merchants/{merchantId}/products`             |

The MVP must demonstrate merchant onboarding through one simple form, API walkthrough, or CSV import. A polished merchant dashboard is not required.

---

## 13. End-to-End Sequence

```text
User sends a message
  -> TIM extracts UserIntent
  -> TIM calls search_products
  -> TIM calls request_offers
  -> SANGYOON validates product, inventory, delivery, and policy
  -> SANGYOON returns Offer[]
  -> TIM ranks the offers and displays a transaction preview
  -> User explicitly confirms
  -> TIM sends OrderRequest
  -> SANGYOON revalidates the offer, inventory, price, and confirmation
  -> SANGYOON creates the order
  -> TIM calls initiate_payment
  -> SANGYOON runs the mock Visa payment
  -> SANGYOON returns PaymentResult
  -> TIM displays the final payment status
```

---

## 14. MVP Acceptance Checklist

### Shared contract

- [ ] TIM and SANGYOON use the same Zod schemas and inferred TypeScript types.
- [ ] All timestamps include a timezone.
- [ ] All transport fields use `camelCase`.
- [ ] MCP tool names exactly match this document.
- [ ] HTTP responses use the shared success and error envelopes.

### Offer

- [x] A wrong size or color variant is excluded.
- [x] An out-of-stock product is excluded.
- [x] An offered price never falls below the merchant minimum.
- [x] An over-budget offer is not returned.
- [x] Offer expiry is stored and enforced.

### Order and consent

- [x] An order is not created unless `userConfirmed === true`.
- [x] Retrying the same `requestId` does not create a duplicate order.
- [x] An expired offer cannot create an order.
- [x] A price or inventory change requires user reconfirmation.

### Payment and safety

- [ ] Mock Visa authorization and decline scenarios both work.
- [ ] Only `authorized` is displayed as success.
- [ ] Raw card numbers and CVVs never appear in the database, logs, or API responses.
- [ ] The payment amount matches the order amount.
- [ ] The end-to-end `discover -> decide -> pay` demo completes inside the conversation.

---

## 15. Change Control

Record proposed changes at the end of this document using the following format:

```text
Date:
Requested by:
Change:
Reason:
Backward compatible: yes/no
Approved by: SANGYOON / TIM
```

A change marked `Backward compatible: no` must not be merged until both owners approve it.

### Change log

- `2026-08-29` - v1.0 initial contract frozen and aligned with the TypeScript repository architecture.
