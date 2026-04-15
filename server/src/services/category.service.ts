import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";

type CategoryInput = {
  name?: unknown;
  order?: unknown;
  active?: unknown;
};

type ReorderCategoriesInput = {
  orderedIds?: unknown;
};

function normalizeName(name: unknown) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw createHttpError(400, "Category name is required");
  }

  return name.trim();
}

function normalizeOrder(order: unknown) {
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    throw createHttpError(400, "Order must be an integer greater than 0");
  }

  return order;
}

function mapCategoryWithCount<
  T extends {
    _count?: {
      products?: number;
    };
  }
>(category: T) {
  return {
    ...category,
    productCount: category._count?.products ?? 0
  };
}

function normalizeOrderedIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createHttpError(400, "orderedIds must be a non-empty array");
  }

  const orderedIds = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw createHttpError(400, "orderedIds must contain valid ids");
    }

    return item.trim();
  });

  return Array.from(new Set(orderedIds));
}

export async function listActiveCategories(restaurantId: string) {
  const categories = await prisma.category.findMany({
    where: {
      restaurantId,
      active: true
    },
    include: {
      _count: {
        select: {
          products: true
        }
      }
    },
    orderBy: {
      order: "asc"
    }
  });

  return categories.map(mapCategoryWithCount);
}

export async function listAllCategories(restaurantId: string) {
  const categories = await prisma.category.findMany({
    where: {
      restaurantId
    },
    include: {
      _count: {
        select: {
          products: true
        }
      }
    },
    orderBy: [{ order: "asc" }, { name: "asc" }]
  });

  return categories.map(mapCategoryWithCount);
}

export async function createCategory(restaurantId: string, input: CategoryInput) {
  const name = normalizeName(input.name);
  const order = normalizeOrder(input.order);

  return prisma.category.create({
    data: {
      name,
      order,
      active: true,
      restaurantId
    }
  });
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  input: CategoryInput
) {
  const existing = await prisma.category.findFirst({
    where: {
      id: categoryId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Category not found");
  }

  const data: {
    name?: string;
    order?: number;
    active?: boolean;
  } = {};

  if (input.name !== undefined) {
    data.name = normalizeName(input.name);
  }

  if (input.order !== undefined) {
    data.order = normalizeOrder(input.order);
  }

  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      throw createHttpError(400, "Active must be a boolean");
    }

    data.active = input.active;
  }

  return prisma.category.update({
    where: {
      id: categoryId
    },
    data
  });
}

export async function reorderCategory(
  restaurantId: string,
  categoryId: string,
  nextOrderValue: unknown
) {
  const nextOrder = normalizeOrder(nextOrderValue);

  const categories = await prisma.category.findMany({
    where: {
      restaurantId
    },
    orderBy: [{ order: "asc" }, { name: "asc" }]
  });

  const currentIndex = categories.findIndex(
    (category: { id: string }) => category.id === categoryId
  );

  if (currentIndex === -1) {
    throw createHttpError(404, "Category not found");
  }

  const reordered = [...categories];
  const [movedCategory] = reordered.splice(currentIndex, 1);

  if (!movedCategory) {
    throw createHttpError(404, "Category not found");
  }

  const targetIndex = Math.min(Math.max(nextOrder - 1, 0), reordered.length);
  reordered.splice(targetIndex, 0, movedCategory);

  await prisma.$transaction(
    reordered.map((category: { id: string }, index) =>
      prisma.category.update({
        where: {
          id: category.id
        },
        data: {
          order: index + 1
        }
      })
    )
  );

  return listAllCategories(restaurantId);
}

export async function reorderCategories(
  restaurantId: string,
  input: ReorderCategoriesInput
) {
  const orderedIds = normalizeOrderedIds(input.orderedIds);
  const categories = await prisma.category.findMany({
    where: {
      restaurantId
    },
    orderBy: [{ order: "asc" }, { name: "asc" }]
  });

  if (categories.length !== orderedIds.length) {
    throw createHttpError(400, "orderedIds must include every category exactly once");
  }

  const existingIds = new Set(categories.map((category) => category.id));

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw createHttpError(400, "orderedIds contains categories outside this restaurant");
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({
        where: {
          id
        },
        data: {
          order: index + 1
        }
      })
    )
  );

  return listAllCategories(restaurantId);
}

export async function softDeleteCategory(restaurantId: string, categoryId: string) {
  const existing = await prisma.category.findFirst({
    where: {
      id: categoryId,
      restaurantId
    }
  });

  if (!existing) {
    throw createHttpError(404, "Category not found");
  }

  await prisma.$transaction([
    prisma.category.update({
      where: {
        id: categoryId
      },
      data: {
        active: false
      }
    }),
    prisma.product.updateMany({
      where: {
        categoryId,
        restaurantId
      },
      data: {
        available: false
      }
    })
  ]);

  const category = await prisma.category.findUnique({
    where: {
      id: categoryId
    },
    include: {
      _count: {
        select: {
          products: true
        }
      }
    }
  });

  if (!category) {
    throw createHttpError(404, "Category not found");
  }

  return mapCategoryWithCount(category);
}
