-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "merchant_status" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "inventory_availability" AS ENUM ('in_stock', 'low_stock', 'out_of_stock');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('active', 'expired', 'accepted', 'cancelled');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('payment_pending', 'paid', 'payment_failed', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'requires_verification', 'authorized', 'declined', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(255),
    "description" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "contact_email" VARCHAR(255),
    "status" "merchant_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(255),
    "brand" VARCHAR(255),
    "listed_price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "attributes" JSONB,
    "image_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_key" VARCHAR(255) NOT NULL,
    "quantity_available" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "availability" "inventory_availability" NOT NULL DEFAULT 'in_stock',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_policies" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "negotiation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "minimum_price" DECIMAL(12,2),
    "max_discount_percent" DECIMAL(5,2),
    "inventory_discount_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_key" VARCHAR(255) NOT NULL,
    "attributes" JSONB NOT NULL,
    "listed_price" DECIMAL(12,2) NOT NULL,
    "offered_price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "delivery_available" BOOLEAN NOT NULL DEFAULT true,
    "delivery_estimate" TIMESTAMPTZ(3),
    "price_explanation" TEXT NOT NULL,
    "status" "offer_status" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "user_confirmed" BOOLEAN NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmation_channel" VARCHAR(50) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'payment_pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL DEFAULT 'Visa',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "payment_token" TEXT,
    "cardholder_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "authorization_reference" VARCHAR(255),
    "failure_code" VARCHAR(100),
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "products"
ADD CONSTRAINT "products_listed_price_nonnegative"
CHECK ("listed_price" >= 0);

-- AddCheckConstraint
ALTER TABLE "inventory"
ADD CONSTRAINT "inventory_quantities_valid"
CHECK (
    "quantity_available" >= 0
    AND "quantity_reserved" >= 0
    AND "quantity_reserved" <= "quantity_available"
);

-- AddCheckConstraint
ALTER TABLE "pricing_policies"
ADD CONSTRAINT "pricing_policies_values_valid"
CHECK (
    ("minimum_price" IS NULL OR "minimum_price" >= 0)
    AND (
        "max_discount_percent" IS NULL
        OR "max_discount_percent" BETWEEN 0 AND 100
    )
    AND (NOT "negotiation_enabled" OR "minimum_price" IS NOT NULL)
);

-- AddCheckConstraint
ALTER TABLE "offers"
ADD CONSTRAINT "offers_values_valid"
CHECK (
    "listed_price" >= 0
    AND "offered_price" >= 0
    AND "offered_price" <= "listed_price"
    AND "quantity" > 0
    AND "expires_at" > "created_at"
);

-- AddCheckConstraint
ALTER TABLE "orders"
ADD CONSTRAINT "orders_values_valid"
CHECK (
    "quantity" > 0
    AND "unit_price" >= 0
    AND "total_amount" = "unit_price" * "quantity"
    AND "user_confirmed"
);

-- AddCheckConstraint
ALTER TABLE "payments"
ADD CONSTRAINT "payments_values_valid"
CHECK (
    "amount" >= 0
    AND (
        "status" <> 'authorized'
        OR "authorization_reference" IS NOT NULL
    )
    AND (
        "status" NOT IN ('declined', 'failed', 'cancelled')
        OR "authorization_reference" IS NULL
    )
);

-- CreateIndex
CREATE INDEX "merchants_category_status_idx" ON "merchants"("category", "status");

-- CreateIndex
CREATE INDEX "products_merchant_id_active_idx" ON "products"("merchant_id", "active");

-- CreateIndex
CREATE INDEX "products_category_brand_active_idx" ON "products"("category", "brand", "active");

-- CreateIndex
CREATE INDEX "inventory_merchant_id_availability_idx" ON "inventory"("merchant_id", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_id_variant_key_key" ON "inventory"("product_id", "variant_key");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_policies_product_id_key" ON "pricing_policies"("product_id");

-- CreateIndex
CREATE INDEX "pricing_policies_merchant_id_idx" ON "pricing_policies"("merchant_id");

-- CreateIndex
CREATE INDEX "offers_intent_id_status_expires_at_idx" ON "offers"("intent_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "offers_merchant_id_status_idx" ON "offers"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "offers_product_id_status_idx" ON "offers"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_request_id_key" ON "orders"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_offer_id_key" ON "orders"("offer_id");

-- CreateIndex
CREATE INDEX "orders_user_id_status_created_at_idx" ON "orders"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_merchant_id_status_created_at_idx" ON "orders"("merchant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_request_id_key" ON "payments"("request_id");

-- CreateIndex
CREATE INDEX "payments_order_id_status_created_at_idx" ON "payments"("order_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
