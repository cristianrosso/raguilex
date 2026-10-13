CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED');

ALTER TABLE "sales"
ADD COLUMN "idempotency_key" text,
ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED';

CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");
