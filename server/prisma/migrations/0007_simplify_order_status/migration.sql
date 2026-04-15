ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "Order"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "Order"
SET "status" = 'ACTIVE'
WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED');

ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus"
  USING "status"::"OrderStatus";

ALTER TABLE "Order"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "OrderStatus_old";
