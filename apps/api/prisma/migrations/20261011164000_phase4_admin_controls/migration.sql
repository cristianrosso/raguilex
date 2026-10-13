CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED');
CREATE TYPE "ReturnResultStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'REMOVED');

ALTER TABLE "sales"
  ADD COLUMN "cancellation_reason" TEXT,
  ADD COLUMN "cancelled_at" TIMESTAMPTZ,
  ADD COLUMN "cancelled_by" UUID;

ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_product_id_key";
CREATE INDEX IF NOT EXISTS "sale_items_product_id_idx" ON "sale_items" ("product_id");

CREATE TABLE "cash_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "opened_by" UUID NOT NULL,
  "closed_by" UUID,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "opening_amount" DECIMAL(12, 2) NOT NULL,
  "counted_amount" DECIMAL(12, 2),
  "expected_cash" DECIMAL(12, 2),
  "cash_sales" DECIMAL(12, 2),
  "digital_sales" DECIMAL(12, 2),
  "other_sales" DECIMAL(12, 2),
  "income_cash" DECIMAL(12, 2),
  "expense_cash" DECIMAL(12, 2),
  "difference" DECIMAL(12, 2),
  "observations" TEXT,
  "close_notes" TEXT,
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "closed_at" TIMESTAMPTZ,
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_sessions_one_open_idx" ON "cash_sessions" ("status") WHERE "status" = 'OPEN';
CREATE INDEX "cash_sessions_status_idx" ON "cash_sessions" ("status");

CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'EFECTIVO',
  "concept" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_movements_session_id_idx" ON "cash_movements" ("session_id");

CREATE TABLE "reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "sale_id" UUID,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "customer_name" TEXT,
  "customer_phone" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "observations" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservations_one_active_product_idx" ON "reservations" ("product_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations" ("status", "expires_at");
CREATE INDEX "reservations_product_id_idx" ON "reservations" ("product_id");

CREATE TABLE "product_returns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "result_status" "ReturnResultStatus" NOT NULL,
  "amount" DECIMAL(12, 2),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "product_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_returns_sale_id_product_id_key" ON "product_returns" ("sale_id", "product_id");
CREATE INDEX "product_returns_created_at_idx" ON "product_returns" ("created_at");

CREATE TABLE "system_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reservations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_returns"
  ADD CONSTRAINT "product_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "product_returns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "product_returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "system_settings" ("key", "value")
VALUES
  ('company', '{"name":"RAGUILEX","currency":"BOB","timezone":"America/La_Paz","address":"","phone":"","whatsapp":""}'),
  ('inventory', '{"productPrefix":"TN","productFormat":"TN-00001"}'),
  ('sales', '{"salePrefix":"V","saleFormat":"V-000001","paymentMethods":["EFECTIVO","QR_TRANSFERENCIA","OTRO"],"sellerMaxDiscountPercent":0}'),
  ('reservations', '{"enabled":true,"defaultHours":24,"sellerCanReserve":true}'),
  ('locations', '{"main":{"name":"RAGUILEX Principal","address":"","phone":"","active":true}}');
