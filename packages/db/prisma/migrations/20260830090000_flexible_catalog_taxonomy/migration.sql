-- Replace the four rigid product categories with a versioned taxonomy, flexible
-- product/variant attributes, and reusable CSV import mappings. Existing catalog,
-- inventory, Offer, and Order data is preserved throughout the migration.

-- CreateEnum
CREATE TYPE "commerce_domain" AS ENUM (
    'retail_goods',
    'services_subscriptions',
    'bookings'
);

CREATE TYPE "product_kind" AS ENUM (
    'physical_good',
    'digital_product',
    'service',
    'booking'
);

CREATE TYPE "billing_model" AS ENUM (
    'one_time',
    'recurring',
    'usage_based',
    'deposit'
);

CREATE TYPE "availability_model" AS ENUM (
    'stock',
    'unlimited',
    'time_slot',
    'capacity',
    'seat'
);

CREATE TYPE "catalog_import_status" AS ENUM (
    'pending',
    'validating',
    'ready',
    'imported',
    'failed'
);

-- Remove the old category-specific guards before replacing products.category.
DROP TRIGGER IF EXISTS "physical_good_details_category_guard" ON "physical_good_details";
DROP TRIGGER IF EXISTS "digital_product_details_category_guard" ON "digital_product_details";
DROP TRIGGER IF EXISTS "service_details_category_guard" ON "service_details";
DROP TRIGGER IF EXISTS "booking_experience_details_category_guard" ON "booking_experience_details";
DROP TRIGGER IF EXISTS "products_category_change_guard" ON "products";
DROP FUNCTION IF EXISTS "enforce_product_detail_category"();
DROP FUNCTION IF EXISTS "prevent_product_category_change_with_details"();

-- CreateTable: hierarchical taxonomy.
CREATE TABLE "categories" (
    "id" VARCHAR(180) NOT NULL,
    "parent_id" VARCHAR(180),
    "domain" "commerce_domain" NOT NULL,
    "product_kind" "product_kind" NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "level" INTEGER NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "default_billing_model" "billing_model" NOT NULL DEFAULT 'one_time',
    "default_availability_model" "availability_model" NOT NULL DEFAULT 'stock',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "categories_domain_active_idx"
ON "categories"("domain", "active");

CREATE INDEX "categories_parent_id_active_idx"
ON "categories"("parent_id", "active");

CREATE UNIQUE INDEX "categories_parent_id_slug_key"
ON "categories"("parent_id", "slug");

-- Bootstrap categories required to migrate the existing demo catalog. The seed
-- expands this taxonomy and keeps it up to date after the migration completes.
INSERT INTO "categories" (
    "id", "parent_id", "domain", "product_kind", "slug", "name", "level",
    "aliases", "default_billing_model", "default_availability_model",
    "active", "created_at", "updated_at"
) VALUES
    ('retail_goods', NULL, 'retail_goods', 'physical_good', 'retail_goods', 'Retail Goods', 0, ARRAY['physical goods', 'online shopping'], 'one_time', 'stock', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('retail_goods.apparel', 'retail_goods', 'retail_goods', 'physical_good', 'apparel', 'Apparel', 1, ARRAY['clothing'], 'one_time', 'stock', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('retail_goods.apparel.shoes', 'retail_goods.apparel', 'retail_goods', 'physical_good', 'shoes', 'Shoes', 2, ARRAY['footwear', 'sneakers'], 'one_time', 'stock', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('services_subscriptions', NULL, 'services_subscriptions', 'service', 'services_subscriptions', 'Services & Subscriptions', 0, ARRAY['memberships', 'saas'], 'one_time', 'unlimited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('services_subscriptions.digital_products', 'services_subscriptions', 'services_subscriptions', 'digital_product', 'digital_products', 'Digital Products', 1, ARRAY['downloads', 'digital goods'], 'one_time', 'unlimited', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('services_subscriptions.professional_services', 'services_subscriptions', 'services_subscriptions', 'service', 'professional_services', 'Professional Services', 1, ARRAY['consulting', 'coaching'], 'one_time', 'time_slot', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bookings', NULL, 'bookings', 'booking', 'bookings', 'Bookings', 0, ARRAY['travel', 'reservations'], 'one_time', 'capacity', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('bookings.activities', 'bookings', 'bookings', 'booking', 'activities', 'Activities', 1, ARRAY['experiences', 'tours'], 'one_time', 'capacity', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable: versioned category attribute definitions.
CREATE TABLE "category_schemas" (
    "id" UUID NOT NULL,
    "category_id" VARCHAR(180) NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "attribute_schema" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_schemas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "category_schemas"
ADD CONSTRAINT "category_schemas_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "category_schemas_category_id_active_idx"
ON "category_schemas"("category_id", "active");

CREATE UNIQUE INDEX "category_schemas_category_id_version_key"
ON "category_schemas"("category_id", "version");

-- Add and backfill the new Product columns before removing the legacy enum.
ALTER TABLE "products"
ADD COLUMN "external_id" VARCHAR(255),
ADD COLUMN "category_id" VARCHAR(180),
ADD COLUMN "product_kind" "product_kind",
ADD COLUMN "billing_model" "billing_model" NOT NULL DEFAULT 'one_time',
ADD COLUMN "availability_model" "availability_model" NOT NULL DEFAULT 'stock',
ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';

UPDATE "products"
SET
    "category_id" = CASE "category"::text
        WHEN 'physical_goods' THEN 'retail_goods.apparel.shoes'
        WHEN 'digital_products' THEN 'services_subscriptions.digital_products'
        WHEN 'services' THEN 'services_subscriptions.professional_services'
        WHEN 'bookings_experiences' THEN 'bookings.activities'
    END,
    "product_kind" = CASE "category"::text
        WHEN 'physical_goods' THEN 'physical_good'::"product_kind"
        WHEN 'digital_products' THEN 'digital_product'::"product_kind"
        WHEN 'services' THEN 'service'::"product_kind"
        WHEN 'bookings_experiences' THEN 'booking'::"product_kind"
    END,
    "availability_model" = CASE "category"::text
        WHEN 'physical_goods' THEN 'stock'::"availability_model"
        WHEN 'digital_products' THEN 'unlimited'::"availability_model"
        WHEN 'services' THEN 'time_slot'::"availability_model"
        WHEN 'bookings_experiences' THEN 'capacity'::"availability_model"
    END;

UPDATE "products" AS product
SET "attributes" = COALESCE(details."metadata", '{}'::jsonb)
    || CASE WHEN details."material" IS NULL
        THEN '{}'::jsonb
        ELSE jsonb_build_object('material', details."material")
    END
FROM "physical_good_details" AS details
WHERE details."product_id" = product."id";

UPDATE "products" AS product
SET "attributes" = COALESCE(details."metadata", '{}'::jsonb)
FROM "digital_product_details" AS details
WHERE details."product_id" = product."id";

UPDATE "products" AS product
SET "attributes" = COALESCE(details."metadata", '{}'::jsonb)
FROM "service_details" AS details
WHERE details."product_id" = product."id";

UPDATE "products" AS product
SET "attributes" = COALESCE(details."metadata", '{}'::jsonb)
FROM "booking_experience_details" AS details
WHERE details."product_id" = product."id";

ALTER TABLE "products"
ALTER COLUMN "category_id" SET NOT NULL,
ALTER COLUMN "product_kind" SET NOT NULL;

ALTER TABLE "products"
RENAME COLUMN "listed_price" TO "base_price";

DROP INDEX "products_category_brand_active_idx";

ALTER TABLE "products"
DROP COLUMN "category";

DROP TYPE "product_category";

CREATE UNIQUE INDEX "products_merchant_id_external_id_key"
ON "products"("merchant_id", "external_id");

CREATE INDEX "products_category_id_brand_active_idx"
ON "products"("category_id", "brand", "active");

ALTER TABLE "products"
ADD CONSTRAINT "products_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products"
RENAME CONSTRAINT "products_listed_price_nonnegative" TO "products_base_price_nonnegative";

-- CreateTable: variants are no longer encoded inside inventory.variant_key.
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "external_id" VARCHAR(255),
    "sku" VARCHAR(150),
    "name" VARCHAR(255),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "listed_price" DECIMAL(12,2) NOT NULL,
    "image_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_variants_listed_price_nonnegative" CHECK ("listed_price" >= 0)
);

INSERT INTO "product_variants" (
    "id", "merchant_id", "product_id", "external_id", "sku", "name",
    "attributes", "listed_price", "image_url", "active", "created_at", "updated_at"
)
SELECT
    inventory."id",
    inventory."merchant_id",
    inventory."product_id",
    NULL,
    'MIG-' || inventory."id"::text,
    NULL,
    COALESCE(
        (
            SELECT jsonb_object_agg(
                btrim(split_part(segment, '=', 1)),
                btrim(substring(segment FROM position('=' IN segment) + 1))
            )
            FROM unnest(string_to_array(inventory."variant_key", ';')) AS segment
            WHERE position('=' IN segment) > 1
              AND btrim(split_part(segment, '=', 1)) <> ''
              AND btrim(substring(segment FROM position('=' IN segment) + 1)) <> ''
        ),
        '{}'::jsonb
    ),
    product."base_price",
    product."image_url",
    product."active",
    inventory."updated_at",
    inventory."updated_at"
FROM "inventory" AS inventory
JOIN "products" AS product ON product."id" = inventory."product_id";

CREATE INDEX "product_variants_product_id_active_idx"
ON "product_variants"("product_id", "active");

CREATE UNIQUE INDEX "product_variants_merchant_id_sku_key"
ON "product_variants"("merchant_id", "sku");

CREATE UNIQUE INDEX "product_variants_merchant_id_external_id_key"
ON "product_variants"("merchant_id", "external_id");

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Point inventory and existing Offers at the migrated variants.
ALTER TABLE "inventory" ADD COLUMN "variant_id" UUID;
UPDATE "inventory" SET "variant_id" = "id";
ALTER TABLE "inventory" ALTER COLUMN "variant_id" SET NOT NULL;

ALTER TABLE "offers" ADD COLUMN "variant_id" UUID;
UPDATE "offers" AS offer
SET "variant_id" = inventory."id"
FROM "inventory" AS inventory
WHERE inventory."product_id" = offer."product_id"
  AND inventory."variant_key" = offer."variant_key";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "offers" WHERE "variant_id" IS NULL) THEN
        RAISE EXCEPTION 'Cannot migrate Offer because its inventory variant is missing';
    END IF;
END;
$$;

ALTER TABLE "offers" ALTER COLUMN "variant_id" SET NOT NULL;

ALTER TABLE "inventory" DROP CONSTRAINT "inventory_product_id_fkey";
DROP INDEX "inventory_product_id_variant_key_key";
ALTER TABLE "inventory" DROP COLUMN "product_id", DROP COLUMN "variant_key";

ALTER TABLE "offers" DROP COLUMN "variant_key";

CREATE UNIQUE INDEX "inventory_variant_id_key" ON "inventory"("variant_id");
CREATE INDEX "offers_variant_id_status_idx" ON "offers"("variant_id", "status");

ALTER TABLE "inventory"
ADD CONSTRAINT "inventory_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offers"
ADD CONSTRAINT "offers_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove shoe-specific and duplicated metadata columns after their values have
-- been transferred to Product.attributes and ProductVariant.attributes.
DROP INDEX "physical_good_details_sku_key";

ALTER TABLE "physical_good_details"
DROP COLUMN "sku",
DROP COLUMN "size_options",
DROP COLUMN "color_options",
DROP COLUMN "material",
DROP COLUMN "metadata";

ALTER TABLE "digital_product_details" DROP COLUMN "metadata";
ALTER TABLE "service_details" DROP COLUMN "metadata";
ALTER TABLE "booking_experience_details" DROP COLUMN "metadata";

-- CreateTable: reusable Merchant CSV mapping profiles and import audit jobs.
CREATE TABLE "merchant_import_profiles" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "category_id" VARCHAR(180) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "schema_version" VARCHAR(30) NOT NULL,
    "source_headers" JSONB NOT NULL,
    "column_mapping" JSONB NOT NULL,
    "normalization_rules" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_import_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_import_jobs" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "profile_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "source_headers" JSONB NOT NULL,
    "status" "catalog_import_status" NOT NULL DEFAULT 'pending',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "accepted_rows" INTEGER NOT NULL DEFAULT 0,
    "rejected_rows" INTEGER NOT NULL DEFAULT 0,
    "validation_errors" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "catalog_import_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_import_jobs_counts_valid" CHECK (
        "total_rows" >= 0
        AND "accepted_rows" >= 0
        AND "rejected_rows" >= 0
        AND "accepted_rows" + "rejected_rows" <= "total_rows"
    )
);

CREATE INDEX "merchant_import_profiles_merchant_id_active_idx"
ON "merchant_import_profiles"("merchant_id", "active");

CREATE INDEX "merchant_import_profiles_category_id_active_idx"
ON "merchant_import_profiles"("category_id", "active");

CREATE UNIQUE INDEX "merchant_import_profiles_merchant_id_name_key"
ON "merchant_import_profiles"("merchant_id", "name");

CREATE INDEX "catalog_import_jobs_merchant_id_status_created_at_idx"
ON "catalog_import_jobs"("merchant_id", "status", "created_at");

ALTER TABLE "merchant_import_profiles"
ADD CONSTRAINT "merchant_import_profiles_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchant_import_profiles"
ADD CONSTRAINT "merchant_import_profiles_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalog_import_jobs"
ADD CONSTRAINT "catalog_import_jobs_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_import_jobs"
ADD CONSTRAINT "catalog_import_jobs_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "merchant_import_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep category-specific operational details aligned with the category's
-- internal ProductKind. Product attributes themselves remain data-driven.
CREATE FUNCTION "enforce_product_detail_kind"()
RETURNS TRIGGER AS $$
DECLARE
    actual_kind "product_kind";
    expected_kind "product_kind";
BEGIN
    expected_kind := TG_ARGV[0]::"product_kind";

    SELECT "product_kind"
    INTO actual_kind
    FROM "products"
    WHERE "id" = NEW."product_id";

    IF actual_kind IS DISTINCT FROM expected_kind THEN
        RAISE EXCEPTION
            'Product % must have kind %, but its kind is %',
            NEW."product_id",
            expected_kind,
            actual_kind;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "physical_good_details_kind_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "physical_good_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_kind"('physical_good');

CREATE TRIGGER "digital_product_details_kind_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "digital_product_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_kind"('digital_product');

CREATE TRIGGER "service_details_kind_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "service_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_kind"('service');

CREATE TRIGGER "booking_experience_details_kind_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "booking_experience_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_kind"('booking');
