-- The Agent sees only a safe PaymentMethod ID. The provider credential reference
-- remains inside the trusted Commerce backend and can later point to a real vault.
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL DEFAULT 'Visa',
    "provider_credential_ref" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "card_brand" VARCHAR(50) NOT NULL DEFAULT 'Visa',
    "last_four" CHAR(4) NOT NULL,
    "expiry_month" INTEGER NOT NULL,
    "expiry_year" INTEGER NOT NULL,
    "cardholder_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_methods_card_values_valid" CHECK (
        "last_four" ~ '^[0-9]{4}$'
        AND "expiry_month" BETWEEN 1 AND 12
        AND "expiry_year" BETWEEN 2026 AND 2200
    )
);

CREATE UNIQUE INDEX "payment_methods_provider_credential_ref_key"
ON "payment_methods"("provider_credential_ref");

CREATE INDEX "payment_methods_user_id_active_idx"
ON "payment_methods"("user_id", "active");

CREATE UNIQUE INDEX "payment_methods_one_default_per_user_key"
ON "payment_methods"("user_id")
WHERE "active" AND "is_default";

ALTER TABLE "payments" ADD COLUMN "payment_method_id" UUID;

CREATE INDEX "payments_payment_method_id_created_at_idx"
ON "payments"("payment_method_id", "created_at");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_payment_method_id_fkey"
FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
