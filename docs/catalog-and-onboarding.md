# Flexible Catalog and Merchant Onboarding

## Goal

Give SME merchants a plug-and-play onboarding flow even when their forms or CSV files use different field names, while giving the consumer agent one predictable catalog model.

## Canonical catalog layers

### 1. Commerce domain

The domain represents the broad purchase and fulfillment flow:

- `retail_goods`
- `services_subscriptions`
- `bookings`

### 2. Hierarchical category

Products use stable dot-delimited category IDs. Categories of the same type are grouped together so their attributes are comparable.

```text
retail_goods
  apparel
    shoes
  electronics
    smartphones
  books_media
    books
  food_beverage
    restaurant_meals

services_subscriptions
  digital_products
  software
    saas
  memberships
  professional_services

bookings
  transportation
    flights
  accommodation
    hotels
  activities
```

New categories are data, not new database tables or enum releases. A new leaf is added to `Category` with its own versioned `CategorySchema`.

### 3. Category schema

Each schema declares allowed attributes and, for every attribute:

- primitive type: `string`, `number`, or `boolean`
- scope: `product` or `variant`
- whether it is required, filterable, or comparable
- optional aliases used during onboarding

For example, shoes require product `productType` plus variant `size` and `color`. Smartphones require product `productType` and `model` plus variant `storage` and `color`. An iPhone therefore never needs a shoe-size field.

### 4. Stable product core

Relational columns remain consistent for every merchant and category:

- merchant and external IDs
- category and product kind
- name, description, and brand
- base price and currency
- billing and availability model
- active state

Category-specific product attributes are stored as validated JSONB.

### 5. Sellable variant

A `ProductVariant` represents the exact thing that can be bought: a shoe size and color, an iPhone storage and color, a SaaS plan, or an activity time slot. It owns its SKU/external ID, attributes, listed price, and inventory relationship. Offers also store the stable `variantId`.

## Plug-and-play merchant flow

### Structured form

1. Load `GET /v1/categories` and let the merchant choose the closest leaf category.
2. Load `GET /v1/categories/{categoryId}/schema`.
3. Generate product and variant fields from the schema.
4. Submit canonical data to `POST /v1/merchants/{merchantId}/products`. If SKU is blank, the backend generates a readable merchant-scoped SKU and adds a numeric suffix when needed.
5. Update stock through `PUT /v1/variants/{variantId}/inventory`.
6. Update SKU, price, status, or variant attributes through `PATCH /v1/variants/{variantId}` without replacing its stable ID.

The Merchant workspace implements this flow. SKU and external-ID fields are hidden under an optional advanced section because most SMEs should not need to create technical identifiers by hand; those fields remain available for merchants syncing an existing POS, ERP, or online store. The internal stable `variantId` is never merchant input. Removing a product from discovery uses the reversible `active: false` state rather than a physical delete, preserving order, payment, and audit relationships.

### CSV onboarding

1. Read only the CSV header row first.
2. Ask the merchant to select a category.
3. Suggest mappings using normalized header names and the category schema's aliases.
4. Show unresolved required fields and let the merchant correct them.
5. Save the approved mapping through `POST /v1/merchants/{merchantId}/import-profiles`.
6. Validate every row against the same schema before any catalog write.
7. Show accepted/rejected row counts and row-level errors.
8. Reuse the saved mapping for later uploads with the same feed format.

Example mappings for two merchants can differ while the stored data stays identical:

| Merchant header  | Canonical target             |
| ---------------- | ---------------------------- |
| `item_code`      | `variant.sku`                |
| `product_title`  | `product.name`               |
| `storage_size`   | `variant.attributes.storage` |
| `colour`         | `variant.attributes.color`   |
| `unit_price_sgd` | `variant.listedPrice`        |

The raw merchant headers stop at the import boundary. The consumer agent and MCP tools see only canonical domain, category, product, variant, and attribute names.

## Standardization rules

- Use a controlled category tree with aliases; do not let every merchant create arbitrary top-level categories.
- Keep universal transaction fields relational and category attributes extensible.
- Require leaf-category schemas for form generation and validation.
- Version category schemas and bind import profiles to a version.
- Never encode attributes into identifiers. Use stable UUIDs for variants.
- Preserve the merchant's original external IDs for reconciliation.
- Reject or quarantine invalid rows instead of silently dropping unknown data.
- Promote a frequently repeated merchant-specific field into the category schema only after review; do not hardcode it directly into search logic.
