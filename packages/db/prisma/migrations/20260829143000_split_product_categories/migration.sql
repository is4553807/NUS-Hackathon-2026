-- CreateEnum
CREATE TYPE "product_category" AS ENUM (
    'physical_goods',
    'digital_products',
    'services',
    'bookings_experiences'
);

-- CreateEnum
CREATE TYPE "digital_delivery_method" AS ENUM (
    'download',
    'license_key',
    'streaming',
    'account_access'
);

-- CreateEnum
CREATE TYPE "service_delivery_mode" AS ENUM (
    'in_person',
    'remote',
    'hybrid'
);

-- Replace the open-ended product category and attributes with a fixed category.
-- This migration is applied before demo data is seeded, so the products table is empty.
ALTER TABLE "products"
DROP COLUMN "attributes",
DROP COLUMN "category",
ADD COLUMN "category" "product_category" NOT NULL;

-- CreateTable
CREATE TABLE "physical_good_details" (
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(100),
    "size_options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "color_options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "material" VARCHAR(255),
    "weight_grams" INTEGER,
    "length_cm" DECIMAL(8,2),
    "width_cm" DECIMAL(8,2),
    "height_cm" DECIMAL(8,2),
    "shipping_required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "physical_good_details_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "physical_good_details_measurements_valid" CHECK (
        ("weight_grams" IS NULL OR "weight_grams" > 0)
        AND ("length_cm" IS NULL OR "length_cm" > 0)
        AND ("width_cm" IS NULL OR "width_cm" > 0)
        AND ("height_cm" IS NULL OR "height_cm" > 0)
    )
);

-- CreateTable
CREATE TABLE "digital_product_details" (
    "product_id" UUID NOT NULL,
    "delivery_method" "digital_delivery_method" NOT NULL,
    "file_format" VARCHAR(100),
    "file_size_bytes" BIGINT,
    "version" VARCHAR(100),
    "license_required" BOOLEAN NOT NULL DEFAULT false,
    "access_duration_days" INTEGER,
    "fulfillment_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "digital_product_details_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "digital_product_details_values_valid" CHECK (
        ("file_size_bytes" IS NULL OR "file_size_bytes" > 0)
        AND ("access_duration_days" IS NULL OR "access_duration_days" > 0)
    )
);

-- CreateTable
CREATE TABLE "service_details" (
    "product_id" UUID NOT NULL,
    "service_type" VARCHAR(150) NOT NULL,
    "delivery_mode" "service_delivery_mode" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "location" TEXT,
    "service_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "provider_name" VARCHAR(255),
    "booking_required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_details_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "service_details_duration_valid" CHECK ("duration_minutes" > 0)
);

-- CreateTable
CREATE TABLE "booking_experience_details" (
    "product_id" UUID NOT NULL,
    "experience_type" VARCHAR(150),
    "destination" VARCHAR(255) NOT NULL,
    "venue" VARCHAR(255),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Singapore',
    "capacity" INTEGER NOT NULL,
    "min_participants" INTEGER NOT NULL DEFAULT 1,
    "meeting_point" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_experience_details_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "booking_experience_details_schedule_valid" CHECK (
        "ends_at" > "starts_at"
        AND "capacity" > 0
        AND "min_participants" > 0
        AND "min_participants" <= "capacity"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "physical_good_details_sku_key"
ON "physical_good_details"("sku");

-- CreateIndex
CREATE INDEX "booking_experience_details_destination_starts_at_idx"
ON "booking_experience_details"("destination", "starts_at");

-- RecreateIndex (dropping the old category column removes the original index)
CREATE INDEX "products_category_brand_active_idx"
ON "products"("category", "brand", "active");

-- AddForeignKey
ALTER TABLE "physical_good_details"
ADD CONSTRAINT "physical_good_details_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_product_details"
ADD CONSTRAINT "digital_product_details_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_details"
ADD CONSTRAINT "service_details_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_experience_details"
ADD CONSTRAINT "booking_experience_details_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce that every category detail row belongs to a Product of that category.
CREATE FUNCTION "enforce_product_detail_category"()
RETURNS TRIGGER AS $$
DECLARE
    actual_category "product_category";
    expected_category "product_category";
BEGIN
    expected_category := TG_ARGV[0]::"product_category";

    SELECT "category"
    INTO actual_category
    FROM "products"
    WHERE "id" = NEW."product_id";

    IF actual_category IS DISTINCT FROM expected_category THEN
        RAISE EXCEPTION
            'Product % must have category %, but its category is %',
            NEW."product_id",
            expected_category,
            actual_category;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "physical_good_details_category_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "physical_good_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_category"('physical_goods');

CREATE TRIGGER "digital_product_details_category_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "digital_product_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_category"('digital_products');

CREATE TRIGGER "service_details_category_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "service_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_category"('services');

CREATE TRIGGER "booking_experience_details_category_guard"
BEFORE INSERT OR UPDATE OF "product_id" ON "booking_experience_details"
FOR EACH ROW EXECUTE FUNCTION "enforce_product_detail_category"('bookings_experiences');

-- Category changes require the old detail row to be removed first. This prevents
-- a Product from silently retaining details from a different category.
CREATE FUNCTION "prevent_product_category_change_with_details"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."category" IS DISTINCT FROM OLD."category"
       AND (
           EXISTS (
               SELECT 1 FROM "physical_good_details"
               WHERE "product_id" = NEW."id"
           )
           OR EXISTS (
               SELECT 1 FROM "digital_product_details"
               WHERE "product_id" = NEW."id"
           )
           OR EXISTS (
               SELECT 1 FROM "service_details"
               WHERE "product_id" = NEW."id"
           )
           OR EXISTS (
               SELECT 1 FROM "booking_experience_details"
               WHERE "product_id" = NEW."id"
           )
       ) THEN
        RAISE EXCEPTION
            'Remove Product % category details before changing category',
            NEW."id";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "products_category_change_guard"
BEFORE UPDATE OF "category" ON "products"
FOR EACH ROW EXECUTE FUNCTION "prevent_product_category_change_with_details"();
