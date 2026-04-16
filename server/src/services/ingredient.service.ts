import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";

type IngredientInput = {
  name?: unknown;
  category?: unknown;
  extraPrice?: unknown;
  available?: unknown;
  order?: unknown;
};

const CATEGORIES = ["BASE", "SAUCE", "EXTRA", "TOPPING"] as const;

const ingredientModel = prisma as unknown as {
  ingredient: {
    findMany: (args: unknown) => Promise<unknown[]>;
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

function normalizeName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, "Ingredient name is required");
  }

  return value.trim();
}

function normalizeCategory(value: unknown) {
  if (typeof value !== "string" || !CATEGORIES.includes(value as (typeof CATEGORIES)[number])) {
    throw createHttpError(400, "Invalid ingredient category");
  }

  return value;
}

function normalizeExtraPrice(value: unknown) {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw createHttpError(400, "extraPrice must be a number greater than or equal to 0");
  }

  return Number(value.toFixed(2));
}

function normalizeAvailable(value: unknown) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== "boolean") {
    throw createHttpError(400, "available must be a boolean");
  }

  return value;
}

function normalizeOrder(value: unknown) {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw createHttpError(400, "order must be an integer greater than or equal to 0");
  }

  return value;
}

function isUniqueNameError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function listIngredients(restaurantId: string) {
  return ingredientModel.ingredient.findMany({
    where: {
      restaurantId
    },
    orderBy: [{ category: "asc" }, { order: "asc" }, { name: "asc" }]
  } as never);
}

export async function createIngredient(restaurantId: string, input: IngredientInput) {
  const name = normalizeName(input.name);
  const category = normalizeCategory(input.category);
  const extraPrice = normalizeExtraPrice(input.extraPrice);
  const available = normalizeAvailable(input.available);
  const order = normalizeOrder(input.order);

  try {
    return await ingredientModel.ingredient.create({
      data: {
        restaurantId,
        name,
        category,
        extraPrice,
        available,
        order
      }
    });
  } catch (error) {
    if (isUniqueNameError(error)) {
      throw createHttpError(400, "Ya existe un ingrediente con ese nombre");
    }

    throw error;
  }
}

export async function updateIngredient(restaurantId: string, ingredientId: string, input: IngredientInput) {
  const existing = await ingredientModel.ingredient.findFirst({
    where: {
      id: ingredientId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Ingredient not found");
  }

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = normalizeName(input.name);
  if (input.category !== undefined) data.category = normalizeCategory(input.category);
  if (input.extraPrice !== undefined) data.extraPrice = normalizeExtraPrice(input.extraPrice);
  if (input.available !== undefined) data.available = normalizeAvailable(input.available);
  if (input.order !== undefined) data.order = normalizeOrder(input.order);

  try {
    return await ingredientModel.ingredient.update({
      where: { id: ingredientId },
      data
    });
  } catch (error) {
    if (isUniqueNameError(error)) {
      throw createHttpError(400, "Ya existe un ingrediente con ese nombre");
    }

    throw error;
  }
}

export async function deleteIngredient(restaurantId: string, ingredientId: string) {
  const existing = await ingredientModel.ingredient.findFirst({
    where: {
      id: ingredientId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Ingredient not found");
  }

  return ingredientModel.ingredient.update({
    where: { id: ingredientId },
    data: {
      available: false
    }
  });
}
