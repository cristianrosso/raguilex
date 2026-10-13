CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SELLER');
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'MAINTENANCE', 'REMOVED');
CREATE TYPE "MovementType" AS ENUM ('IMPORT', 'ENTRY', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'REMOVAL');
CREATE TYPE "ImportStatus" AS ENUM ('ANALYZED', 'IMPORTED', 'FAILED');
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR', 'SKIPPED', 'IMPORTED');

CREATE TABLE "roles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" "RoleCode" NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "username" text NOT NULL,
  "email" text,
  "password_hash" text NOT NULL,
  "role_id" uuid NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "last_login" timestamptz,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conditions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "address" text,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_code_counters" (
  "prefix" text NOT NULL,
  "last_number" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "internal_code_counters_pkey" PRIMARY KEY ("prefix"),
  CONSTRAINT "internal_code_counters_last_number_check" CHECK ("last_number" >= 0)
);

CREATE TABLE "products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "internal_code" text NOT NULL,
  "category_id" uuid NOT NULL,
  "brand_id" uuid,
  "model" text,
  "size" text,
  "color" text,
  "gender" text,
  "condition_id" uuid,
  "purchase_cost" numeric(12,2),
  "sale_price" numeric(12,2),
  "currency" char(3) NOT NULL DEFAULT 'BOB',
  "status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
  "description" text,
  "observations" text,
  "location_id" uuid,
  "barcode" text,
  "qr_token" uuid NOT NULL DEFAULT gen_random_uuid(),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_internal_code_check" CHECK ("internal_code" ~ '^TN-[0-9]{5}$')
);

CREATE TABLE "product_images" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_number" text NOT NULL,
  "seller_id" uuid NOT NULL,
  "location_id" uuid,
  "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
  "discount" numeric(12,2) NOT NULL DEFAULT 0,
  "total" numeric(12,2) NOT NULL DEFAULT 0,
  "payment_method" text,
  "observations" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "original_price" numeric(12,2) NOT NULL,
  "sale_price" numeric(12,2) NOT NULL,
  "discount" numeric(12,2) NOT NULL DEFAULT 0,
  "purchase_cost_snapshot" numeric(12,2),
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_movements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "movement_type" "MovementType" NOT NULL,
  "previous_status" "InventoryStatus",
  "new_status" "InventoryStatus",
  "user_id" uuid,
  "reference_type" text,
  "reference_id" uuid,
  "observations" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" uuid,
  "before_values" jsonb,
  "after_values" jsonb,
  "ip_address" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_filename" text NOT NULL,
  "file_sha256" text NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'ANALYZED',
  "total_rows" integer NOT NULL DEFAULT 0,
  "valid_rows" integer NOT NULL DEFAULT 0,
  "warning_rows" integer NOT NULL DEFAULT 0,
  "error_rows" integer NOT NULL DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_rows" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "import_batch_id" uuid NOT NULL,
  "excel_sheet" text NOT NULL,
  "excel_row" integer NOT NULL,
  "internal_code" text,
  "normalized_payload" jsonb NOT NULL,
  "original_payload" jsonb NOT NULL,
  "validation_status" "ImportRowStatus" NOT NULL,
  "validation_messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");
CREATE UNIQUE INDEX "conditions_name_key" ON "conditions"("name");
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");
CREATE UNIQUE INDEX "products_internal_code_key" ON "products"("internal_code");
CREATE UNIQUE INDEX "products_qr_token_key" ON "products"("qr_token");
CREATE INDEX "products_internal_code_idx" ON "products"("internal_code");
CREATE INDEX "products_barcode_idx" ON "products"("barcode");
CREATE INDEX "products_status_idx" ON "products"("status");
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");
CREATE UNIQUE INDEX "sale_items_product_id_key" ON "sale_items"("product_id");
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements"("product_id");
CREATE INDEX "import_batches_file_sha256_idx" ON "import_batches"("file_sha256");
CREATE UNIQUE INDEX "import_rows_import_batch_id_excel_sheet_excel_row_key" ON "import_rows"("import_batch_id", "excel_sheet", "excel_row");

CREATE INDEX "products_search_idx"
  ON "products" USING gin (
    to_tsvector(
      'simple',
      coalesce("internal_code", '') || ' ' ||
      coalesce("model", '') || ' ' ||
      coalesce("size", '') || ' ' ||
      coalesce("color", '') || ' ' ||
      coalesce("barcode", '')
    )
  );

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "roles" ("code", "name") VALUES
  ('SUPER_ADMIN', 'Super administrador'),
  ('ADMIN', 'Administrador'),
  ('SELLER', 'Vendedor')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "categories" ("name") VALUES
  ('Tenis/Calzado'),
  ('Ropa')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "conditions" ("name", "sort_order") VALUES
  ('Premium', 10),
  ('Excelente', 20),
  ('Muy bueno', 30),
  ('Bueno', 40),
  ('Regular', 50)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "locations" ("name") VALUES
  ('Raguilex Principal')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "internal_code_counters" ("prefix", "last_number") VALUES
  ('TN', 300)
ON CONFLICT ("prefix") DO UPDATE SET
  "last_number" = GREATEST("internal_code_counters"."last_number", excluded."last_number"),
  "updated_at" = now();

CREATE OR REPLACE FUNCTION next_internal_code(p_prefix text DEFAULT 'TN')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_number integer;
BEGIN
  INSERT INTO internal_code_counters(prefix, last_number)
  VALUES (p_prefix, 0)
  ON CONFLICT (prefix) DO NOTHING;

  UPDATE internal_code_counters
  SET last_number = last_number + 1,
      updated_at = now()
  WHERE prefix = p_prefix
  RETURNING last_number INTO next_number;

  RETURN p_prefix || '-' || lpad(next_number::text, 5, '0');
END;
$$;
