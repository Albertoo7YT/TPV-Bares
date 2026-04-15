CREATE TYPE "IngredientCategory" AS ENUM ('BASE', 'SAUCE', 'EXTRA', 'TOPPING');
CREATE TYPE "OrderItemModificationAction" AS ENUM ('REMOVED', 'ADDED');

CREATE TABLE "Ingredient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "IngredientCategory" NOT NULL,
  "extraPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductIngredient" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ProductIngredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItemModification" (
  "id" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "action" "OrderItemModificationAction" NOT NULL,
  "extraPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "OrderItemModification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ingredient_restaurantId_name_key" ON "Ingredient"("restaurantId", "name");
CREATE INDEX "Ingredient_restaurantId_category_order_idx" ON "Ingredient"("restaurantId", "category", "order");

CREATE UNIQUE INDEX "ProductIngredient_productId_ingredientId_key" ON "ProductIngredient"("productId", "ingredientId");
CREATE INDEX "ProductIngredient_productId_idx" ON "ProductIngredient"("productId");
CREATE INDEX "ProductIngredient_ingredientId_idx" ON "ProductIngredient"("ingredientId");

CREATE INDEX "OrderItemModification_orderItemId_idx" ON "OrderItemModification"("orderItemId");
CREATE INDEX "OrderItemModification_ingredientId_idx" ON "OrderItemModification"("ingredientId");

ALTER TABLE "Ingredient"
  ADD CONSTRAINT "Ingredient_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductIngredient"
  ADD CONSTRAINT "ProductIngredient_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductIngredient"
  ADD CONSTRAINT "ProductIngredient_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItemModification"
  ADD CONSTRAINT "OrderItemModification_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItemModification"
  ADD CONSTRAINT "OrderItemModification_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
