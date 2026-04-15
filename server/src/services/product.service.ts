import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import { unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ProductInput = {
  name?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  price?: unknown;
  categoryId?: unknown;
  available?: unknown;
};

type ProductIngredientInput = {
  ingredientId?: unknown;
  isDefault?: unknown;
};

const PRODUCTS_UPLOADS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../uploads/products"
);

const prismaWithIngredientModels = prisma as unknown as typeof prisma & {
  ingredient: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
};

function normalizeName(name: unknown) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw createHttpError(400, "Product name is required");
  }

  return name.trim();
}

function normalizeDescription(description: unknown) {
  if (description === undefined || description === null || description === "") {
    return null;
  }

  if (typeof description !== "string") {
    throw createHttpError(400, "Description must be a string");
  }

  return description.trim() || null;
}

function normalizePrice(price: unknown) {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw createHttpError(400, "Price must be a number greater than 0");
  }

  return price;
}

function normalizeCategoryId(categoryId: unknown) {
  if (typeof categoryId !== "string" || categoryId.trim().length === 0) {
    throw createHttpError(400, "Category id is required");
  }

  return categoryId.trim();
}

function normalizeImageUrl(imageUrl: unknown) {
  if (imageUrl === undefined) {
    return undefined;
  }

  if (imageUrl === null || imageUrl === "") {
    return null;
  }

  if (typeof imageUrl !== "string") {
    throw createHttpError(400, "imageUrl must be a string");
  }

  const normalized = imageUrl.trim();

  if (!normalized.startsWith("/uploads/products/")) {
    throw createHttpError(400, "imageUrl must point to /uploads/products");
  }

  return normalized;
}

function normalizeAvailable(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw createHttpError(400, "available must be a boolean");
  }

  return value;
}

function normalizeIngredientAssignments(value: unknown) {
  if (!Array.isArray(value)) {
    throw createHttpError(400, "Ingredient assignments must be an array");
  }

  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw createHttpError(400, "Each ingredient assignment must be an object");
    }

    const item = entry as ProductIngredientInput;

    if (typeof item.ingredientId !== "string" || item.ingredientId.trim().length === 0) {
      throw createHttpError(400, "ingredientId is required");
    }

    if (typeof item.isDefault !== "boolean") {
      throw createHttpError(400, "isDefault must be a boolean");
    }

    return {
      ingredientId: item.ingredientId.trim(),
      isDefault: item.isDefault
    };
  });
}

async function removeProductImage(imageUrl: string | null | undefined) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/products/")) {
    return;
  }

  const filename = imageUrl.slice("/uploads/products/".length);
  const filePath = resolve(PRODUCTS_UPLOADS_DIR, filename);

  try {
    await unlink(filePath);
  } catch {
    // Ignore missing files; the database state is the source of truth.
  }
}

async function ensureCategoryBelongsToRestaurant(
  restaurantId: string,
  categoryId: string
) {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      restaurantId
    }
  });

  if (!category) {
    throw createHttpError(404, "Category not found");
  }

  return category;
}

export async function listAvailableProductsGrouped(restaurantId: string) {
  const categories = (await prisma.category.findMany({
    where: {
      restaurantId,
      active: true
    },
    orderBy: {
      order: "asc"
    },
    include: {
      products: {
        where: {
          available: true
        },
        orderBy: {
          name: "asc"
        },
        include: {
          productIngredients: {
            where: {
              ingredient: {
                available: true
              }
            },
            orderBy: {
              ingredient: {
                order: "asc"
              }
            },
            include: {
              ingredient: true
            }
          }
        }
      }
    }
  } as never)) as unknown as Array<{
    id: string;
    name: string;
    order: number;
    products: unknown[];
  }>;

  return categories.map((category: {
    id: string;
    name: string;
    order: number;
    products: unknown[];
  }) => ({
    id: category.id,
    name: category.name,
    order: category.order,
    products: category.products
  }));
}

export async function listAllProducts(restaurantId: string) {
  return prisma.product.findMany({
    where: {
      restaurantId
    },
    orderBy: [{ category: { order: "asc" } }, { name: "asc" }],
    include: {
      category: true,
      productIngredients: {
        include: {
          ingredient: true
        },
        orderBy: {
          ingredient: {
            order: "asc"
          }
        }
      }
    }
  } as never);
}

export async function listFrequentProducts(restaurantId: string, limitValue: unknown) {
  const limit =
    typeof limitValue === "string" && limitValue.trim()
      ? Math.max(1, Math.min(12, Number.parseInt(limitValue, 10) || 8))
      : 8;
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: {
          gte: since
        },
        table: {
          restaurantId
        }
      },
      product: {
        available: true
      }
    },
    select: {
      quantity: true,
      productId: true
    }
  });

  const quantitiesByProduct = new Map<string, number>();

  for (const item of orderItems) {
    quantitiesByProduct.set(item.productId, (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  const productIds = [...quantitiesByProduct.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([productId]) => productId);

  if (productIds.length === 0) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      restaurantId,
      id: {
        in: productIds
      }
    },
    include: {
      category: true,
      productIngredients: {
        where: {
          ingredient: {
            available: true
          }
        },
        orderBy: {
          ingredient: {
            order: "asc"
          }
        },
        include: {
          ingredient: true
        }
      }
    }
  } as never);

  const productById = new Map(products.map((product) => [product.id, product]));

  return productIds
    .map((productId) => productById.get(productId))
    .filter(Boolean)
    .map((product) => ({
      ...(product as NonNullable<typeof product>),
      soldQuantity: quantitiesByProduct.get((product as NonNullable<typeof product>).id) ?? 0
    }));
}

export async function createProduct(restaurantId: string, input: ProductInput) {
  const name = normalizeName(input.name);
  const description = normalizeDescription(input.description);
  const imageUrl = normalizeImageUrl(input.imageUrl);
  const price = normalizePrice(input.price);
  const categoryId = normalizeCategoryId(input.categoryId);
  const available = normalizeAvailable(input.available) ?? true;

  await ensureCategoryBelongsToRestaurant(restaurantId, categoryId);

  return prisma.product.create({
    data: {
      name,
      description,
      imageUrl,
      price,
      categoryId,
      restaurantId,
      available
    }
  });
}

export async function updateProduct(
  restaurantId: string,
  productId: string,
  input: ProductInput
) {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Product not found");
  }

  const data: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    price?: number;
    categoryId?: string;
    available?: boolean;
  } = {};

  if (input.name !== undefined) {
    data.name = normalizeName(input.name);
  }

  if (input.description !== undefined) {
    data.description = normalizeDescription(input.description);
  }

  if (input.imageUrl !== undefined) {
    data.imageUrl = normalizeImageUrl(input.imageUrl);
  }

  if (input.price !== undefined) {
    data.price = normalizePrice(input.price);
  }

  if (input.categoryId !== undefined) {
    const categoryId = normalizeCategoryId(input.categoryId);
    await ensureCategoryBelongsToRestaurant(restaurantId, categoryId);
    data.categoryId = categoryId;
  }

  if (input.available !== undefined) {
    data.available = normalizeAvailable(input.available);
  }

  if (existing.imageUrl && data.imageUrl !== undefined && existing.imageUrl !== data.imageUrl) {
    await removeProductImage(existing.imageUrl);
  }

  return prisma.product.update({
    where: {
      id: productId
    },
    data
  });
}

export async function toggleProductAvailability(restaurantId: string, productId: string) {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Product not found");
  }

  return prisma.product.update({
    where: {
      id: productId
    },
    data: {
      available: !existing.available
    }
  });
}

export async function softDeleteProduct(restaurantId: string, productId: string) {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Product not found");
  }

  await removeProductImage(existing.imageUrl);

  return prisma.product.update({
    where: {
      id: productId
    },
    data: {
      available: false,
      imageUrl: null
    }
  });
}

export async function getProductIngredients(restaurantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      restaurantId
    },
    include: {
      productIngredients: {
        include: {
          ingredient: true
        },
        orderBy: {
          ingredient: {
            order: "asc"
          }
        }
      }
    }
  } as never);

  if (!product) {
    throw createHttpError(404, "Product not found");
  }

  return (product as unknown as {
    productIngredients: unknown[];
  }).productIngredients;
}

export async function replaceProductIngredients(
  restaurantId: string,
  productId: string,
  assignmentsValue: unknown
) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      restaurantId
    }
  });

  if (!product) {
    throw createHttpError(404, "Product not found");
  }

  const assignments = normalizeIngredientAssignments(assignmentsValue);

  if (assignments.length > 0) {
    const ingredients = await prismaWithIngredientModels.ingredient.findMany({
      where: {
        restaurantId,
        id: {
          in: assignments.map((assignment) => assignment.ingredientId)
        } as never
      }
    });

    if (ingredients.length !== new Set(assignments.map((assignment) => assignment.ingredientId)).size) {
      throw createHttpError(400, "Some ingredients do not exist");
    }
  }

  await prisma.$transaction(async (tx) => {
      await (tx as unknown as {
        productIngredient: {
          deleteMany: (args: unknown) => Promise<unknown>;
          createMany: (args: unknown) => Promise<unknown>;
        };
      }).productIngredient.deleteMany({
      where: {
        productId
      }
    });

    if (assignments.length > 0) {
      await (tx as unknown as {
        productIngredient: {
          createMany: (args: unknown) => Promise<unknown>;
        };
      }).productIngredient.createMany({
        data: assignments.map((assignment) => ({
          productId,
          ingredientId: assignment.ingredientId,
          isDefault: assignment.isDefault
        }))
      });
    }
  });

  return getProductIngredients(restaurantId, productId);
}
