-- Never persist a raw payment token. The fingerprint supports idempotency
-- conflict detection without exposing the credential used by the gateway.
ALTER TABLE "payments" DROP COLUMN "payment_token";

ALTER TABLE "payments"
ADD COLUMN "payment_token_fingerprint" CHAR(64);

ALTER TABLE "payments"
ADD CONSTRAINT "payments_token_fingerprint_valid"
CHECK (
    "payment_token_fingerprint" IS NULL
    OR "payment_token_fingerprint" ~ '^[0-9a-f]{64}$'
);

-- At most one payment may be processing, awaiting verification, or authorized
-- for an Order. Declined and failed attempts remain auditable.
CREATE UNIQUE INDEX "payments_one_active_per_order_key"
ON "payments"("order_id")
WHERE "status" IN ('pending', 'requires_verification', 'authorized');
