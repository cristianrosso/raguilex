DROP INDEX IF EXISTS "sale_items_product_id_key";
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_product_id_key";
CREATE INDEX IF NOT EXISTS "sale_items_product_id_idx" ON "sale_items" ("product_id");
