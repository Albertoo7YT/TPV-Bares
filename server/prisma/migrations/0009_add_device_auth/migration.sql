ALTER TABLE "Restaurant"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "passwordHash" TEXT;

UPDATE "Restaurant"
SET "email" = CONCAT('restaurant_', "id", '@example.local')
WHERE "email" IS NULL;

UPDATE "Restaurant"
SET "passwordHash" = 'seed_pending_reset'
WHERE "passwordHash" IS NULL;

ALTER TABLE "Restaurant"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "passwordHash" SET NOT NULL;

CREATE UNIQUE INDEX "Restaurant_email_key" ON "Restaurant"("email");

CREATE TABLE "AuthorizedDevice" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "deviceToken" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthorizedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorizedDevice_deviceToken_key" ON "AuthorizedDevice"("deviceToken");
CREATE INDEX "AuthorizedDevice_restaurantId_active_idx" ON "AuthorizedDevice"("restaurantId", "active");
CREATE INDEX "AuthorizedDevice_lastUsed_idx" ON "AuthorizedDevice"("lastUsed");

ALTER TABLE "AuthorizedDevice"
  ADD CONSTRAINT "AuthorizedDevice_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
