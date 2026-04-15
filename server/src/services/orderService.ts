import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { emitToRestaurant } from "../socket/socketEmitter.js";
import { sendKitchenPrintJob } from "./relay.service.js";

type OrderStatus = "ACTIVE" | "CANCELLED";
type ModificationAction = "REMOVED" | "ADDED";

type CreateOrderItemModificationInput = {
  ingredientId?: unknown;
  action?: unknown;
};

type CreateOrderItemInput = {
  productId?: unknown;
  quantity?: unknown;
  notes?: unknown;
  modifications?: unknown;
};

type UpdateOrderItemInput = {
  quantity?: unknown;
  notes?: unknown;
  modifications?: unknown;
};

type CreateOrderInput = {
  tableId?: unknown;
  items?: unknown;
};

type ListOrdersFilters = {
  statuses?: unknown;
  today?: unknown;
};

type AvailableProduct = {
  id: string;
  price: unknown;
  productIngredients?: Array<{
    isDefault: boolean;
    ingredient: {
      id: string;
      name: string;
      extraPrice: { toNumber(): number } | number;
      available: boolean;
      category: string;
    };
  }>;
};

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: true;
        modifications: {
          include: {
            ingredient: true;
          };
        };
      };
    };
    waiter: {
      select: {
        id: true;
        name: true;
        role: true;
      };
    };
    table: true;
  };
}>;

const ACTIVE_STATUS = "ACTIVE" as never;
const CANCELLED_STATUS = "CANCELLED" as never;

function normalizeId(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizeQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw createHttpError(400, "Quantity must be an integer greater than 0");
  }

  return value;
}

function normalizeNotes(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "Notes must be a string");
  }

  return value.trim() || null;
}

function normalizeModificationAction(value: unknown): ModificationAction {
  if (value !== "REMOVED" && value !== "ADDED") {
    throw createHttpError(400, "Invalid modification action");
  }

  return value;
}

function normalizeModifications(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, "modifications must be an array");
  }

  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw createHttpError(400, "Each modification must be an object");
    }

    const payload = entry as CreateOrderItemModificationInput;

    return {
      ingredientId: normalizeId(payload.ingredientId, "ingredientId"),
      action: normalizeModificationAction(payload.action)
    };
  });
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, "Items must be a non-empty array");
  }

  return items.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw createHttpError(400, "Each item must be an object");
    }

    const payload = item as CreateOrderItemInput;

    return {
      productId: normalizeId(payload.productId, "productId"),
      quantity: normalizeQuantity(payload.quantity),
      notes: normalizeNotes(payload.notes),
      modifications: normalizeModifications(payload.modifications)
    };
  });
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  if (typeof value !== "string" || !["ACTIVE", "CANCELLED"].includes(value)) {
    throw createHttpError(400, "Invalid order status");
  }

  return value as OrderStatus;
}

function normalizeOrderStatusList(value: unknown): OrderStatus[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const rawStatuses = Array.isArray(value)
    ? value.flatMap((entry) => String(entry).split(","))
    : String(value).split(",");

  return Array.from(
    new Set(
      rawStatuses
        .map((status) => status.trim())
        .filter(Boolean)
        .map((status) => normalizeOrderStatus(status))
    )
  );
}

function normalizeTodayFlag(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true" || value === "1";
  }

  return false;
}

function decimalToNumber(value: { toNumber(): number } | number) {
  return typeof value === "number" ? value : value.toNumber();
}

async function ensureTableBelongsToRestaurant(restaurantId: string, tableId: string) {
  const table = await prisma.table.findFirst({
    where: {
      id: tableId,
      restaurantId
    }
  });

  if (!table) {
    throw createHttpError(404, "Table not found");
  }

  return table;
}

async function fetchAvailableProducts(restaurantId: string, productIds: string[]): Promise<AvailableProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds
      },
      restaurantId,
      available: true
    },
    include: {
      productIngredients: {
        include: {
          ingredient: true
        }
      }
    }
  } as never);

  if (products.length !== new Set(productIds).size) {
    throw createHttpError(400, "Some products do not exist or are not available");
  }

  return products as AvailableProduct[];
}

function buildOrderItemData(
  productById: Map<string, AvailableProduct>,
  items: ReturnType<typeof normalizeItems>
) {
  return items.map((item) => {
    const product = productById.get(item.productId);

    if (!product) {
      throw createHttpError(400, "Invalid product selection");
    }

    const allowedIngredients = new Map(
      (product.productIngredients ?? []).map((entry) => [entry.ingredient.id, entry])
    );
    let extraTotal = 0;

    const modifications = item.modifications.map((modification) => {
      const productIngredient = allowedIngredients.get(modification.ingredientId);

      if (!productIngredient || !productIngredient.ingredient.available) {
        throw createHttpError(400, "Invalid ingredient modification");
      }

      if (modification.action === "REMOVED" && !productIngredient.isDefault) {
        throw createHttpError(400, "Only default ingredients can be removed");
      }

      if (modification.action === "ADDED" && productIngredient.isDefault) {
        throw createHttpError(400, "Default ingredients cannot be added as extras");
      }

      const extraPrice =
        modification.action === "ADDED"
          ? Number(
              decimalToNumber(
                productIngredient.ingredient.extraPrice as { toNumber(): number } | number
              ).toFixed(2)
            )
          : 0;

      extraTotal += extraPrice;

      return {
        ingredientId: modification.ingredientId,
        action: modification.action,
        extraPrice
      };
    });

    const basePrice = Number(
      decimalToNumber(product.price as { toNumber(): number } | number).toFixed(2)
    );

    return {
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes,
      unitPrice: Number((basePrice + extraTotal).toFixed(2)),
      modifications
    };
  });
}

function sortModifications(
  modifications: Array<{
    ingredientId: string;
    action: ModificationAction;
    extraPrice?: number;
  }>
) {
  return [...modifications].sort((left, right) => {
    if (left.action !== right.action) {
      return left.action.localeCompare(right.action);
    }

    return left.ingredientId.localeCompare(right.ingredientId);
  });
}

function canEditOrder(order: OrderWithRelations, user: AuthenticatedUser) {
  if (order.status !== "ACTIVE" || order.billId) {
    throw createHttpError(400, "Cannot edit a cancelled or billed order");
  }

  if (user.role !== "ADMIN" && order.waiterId !== user.userId) {
    throw createHttpError(403, "Only the waiter who created the order or an admin can edit it");
  }
}

async function buildSingleOrderItemData(
  restaurantId: string,
  item: {
    productId: string;
    quantity: number;
    notes: string | null;
    modifications: Array<{
      ingredientId: string;
      action: ModificationAction;
    }>;
  }
) {
  const products = await fetchAvailableProducts(restaurantId, [item.productId]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const [orderItemData] = buildOrderItemData(productById, [item]);

  if (!orderItemData) {
    throw createHttpError(400, "Invalid product selection");
  }

  return orderItemData;
}

async function getOrderOrThrow(restaurantId: string, orderId: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      table: {
        restaurantId
      }
    },
    include: {
      items: {
        include: {
          product: true,
          modifications: {
            include: {
              ingredient: true
            }
          }
        }
      },
      waiter: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      table: true
    }
  } as never);

  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  return order as unknown as OrderWithRelations;
}

async function loadOrderWithItems(orderId: string): Promise<OrderWithRelations> {
  return prisma.order.findUniqueOrThrow({
    where: {
      id: orderId
    },
    include: {
      items: {
        include: {
          product: true,
          modifications: {
            include: {
              ingredient: true
            }
          }
        }
      },
      waiter: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      table: true
    }
  } as never) as unknown as Promise<OrderWithRelations>;
}

export async function createOrder(input: CreateOrderInput, user: AuthenticatedUser) {
  const tableId = normalizeId(input.tableId, "tableId");
  const items = normalizeItems(input.items);

  const table = await ensureTableBelongsToRestaurant(user.restaurantId, tableId);
  const products = await fetchAvailableProducts(
    user.restaurantId,
    items.map((item) => item.productId)
  );
  const productById = new Map(products.map((product) => [product.id, product]));
  const orderItemsData = buildOrderItemData(productById, items);

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        tableId,
        waiterId: user.userId,
        status: ACTIVE_STATUS,
        items: {
          create: orderItemsData.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
            unitPrice: item.unitPrice,
            modifications: {
              create: item.modifications
            }
          }))
        }
      }
    } as never);

    if (table.status === "FREE") {
      await tx.table.update({
        where: {
          id: tableId
        },
        data: {
          status: "OCCUPIED"
        }
      });
    }

    return createdOrder;
  });

  const fullOrder = await loadOrderWithItems(order.id);

  emitToRestaurant("order:new", user.restaurantId, fullOrder);
  void sendKitchenPrintJob(user.restaurantId, fullOrder as never).catch((error) => {
    console.error("Kitchen relay print failed for new order", error);
  });

  if (table.status === "FREE") {
    emitToRestaurant("table:statusChanged", user.restaurantId, {
      tableId,
      status: "OCCUPIED"
    });
  }

  return fullOrder;
}

export async function getActiveOrdersForTable(tableId: string, user: AuthenticatedUser) {
  await ensureTableBelongsToRestaurant(user.restaurantId, tableId);

  return prisma.order.findMany({
    where: {
      tableId,
      status: ACTIVE_STATUS,
      billId: null,
      table: {
        restaurantId: user.restaurantId
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    include: {
      items: {
        include: {
          product: true,
          modifications: {
            include: {
              ingredient: true
            }
          }
        }
      },
      waiter: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  } as never);
}

export async function listOrders(filters: ListOrdersFilters, user: AuthenticatedUser) {
  const statuses = normalizeOrderStatusList(filters.statuses);
  const today = normalizeTodayFlag(filters.today);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return prisma.order.findMany({
    where: {
      table: {
        restaurantId: user.restaurantId
      },
      ...(statuses.length > 0
        ? {
            status: {
              in: statuses
            }
          }
        : {}),
      ...(today
        ? {
            createdAt: {
              gte: startOfToday,
              lte: endOfToday
            }
          }
        : {})
    } as never,
    include: {
      items: {
        include: {
          product: true,
          modifications: {
            include: {
              ingredient: true
            }
          }
        }
      },
      waiter: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      table: true
    },
    orderBy: {
      createdAt: "asc"
    }
  } as never);
}

export async function getOrderById(orderId: string, user: AuthenticatedUser) {
  const order = await getOrderOrThrow(user.restaurantId, orderId);
  return loadOrderWithItems(order.id);
}

export async function cancelOrder(orderId: string, user: AuthenticatedUser) {
  const order = await getOrderOrThrow(user.restaurantId, orderId);

  if (order.billId) {
    throw createHttpError(400, "Cannot cancel a billed order");
  }

  const cancelledOrder = await prisma.order.update({
    where: {
      id: order.id
    },
    data: {
      status: CANCELLED_STATUS
    }
  });

  emitToRestaurant("order:cancelled", user.restaurantId, {
    orderId: order.id,
    tableId: order.tableId
  });

  const activeOrdersCount = await prisma.order.count({
    where: {
      tableId: order.tableId,
      status: ACTIVE_STATUS,
      billId: null
    }
  });

  if (activeOrdersCount === 0) {
    await prisma.table.update({
      where: {
        id: order.tableId
      },
      data: {
        status: "FREE"
      }
    });

    emitToRestaurant("table:statusChanged", user.restaurantId, {
      tableId: order.tableId,
      status: "FREE"
    });
  }

  return cancelledOrder;
}

export async function updateOrderItem(
  orderId: string,
  itemId: string,
  input: UpdateOrderItemInput,
  user: AuthenticatedUser
) {
  const order = await getOrderOrThrow(user.restaurantId, orderId);
  canEditOrder(order, user);

  const existingItem = order.items.find((item) => item.id === itemId);

  if (!existingItem) {
    throw createHttpError(404, "Order item not found");
  }

  const nextQuantity =
    input.quantity === undefined ? existingItem.quantity : normalizeQuantity(input.quantity);
  const nextNotes = input.notes === undefined ? existingItem.notes : normalizeNotes(input.notes);
  const nextModifications =
    input.modifications === undefined
      ? existingItem.modifications.map((modification) => ({
          ingredientId: modification.ingredientId,
          action: modification.action as ModificationAction
        }))
      : normalizeModifications(input.modifications);

  const nextItemData = await buildSingleOrderItemData(user.restaurantId, {
    productId: existingItem.productId,
    quantity: nextQuantity,
    notes: nextNotes,
    modifications: nextModifications
  });

  await prisma.$transaction(async (tx) => {
    await tx.orderItemModification.deleteMany({
      where: {
        orderItemId: existingItem.id
      }
    } as never);

    await tx.orderItem.update({
      where: {
        id: existingItem.id
      },
      data: {
        quantity: nextItemData.quantity,
        notes: nextItemData.notes,
        unitPrice: nextItemData.unitPrice,
        modifications: {
          create: nextItemData.modifications
        }
      }
    } as never);
  });

  const fullOrder = await loadOrderWithItems(orderId);
  emitToRestaurant("order:updated", user.restaurantId, fullOrder);

  return fullOrder;
}

export async function deleteOrderItem(orderId: string, itemId: string, user: AuthenticatedUser) {
  const order = await getOrderOrThrow(user.restaurantId, orderId);
  canEditOrder(order, user);

  const existingItem = order.items.find((item) => item.id === itemId);

  if (!existingItem) {
    throw createHttpError(404, "Order item not found");
  }

  if (order.items.length === 1) {
    await cancelOrder(orderId, user);
    return {
      orderId,
      cancelled: true
    };
  }

  await prisma.orderItem.delete({
    where: {
      id: existingItem.id
    }
  });

  const fullOrder = await loadOrderWithItems(orderId);
  emitToRestaurant("order:updated", user.restaurantId, fullOrder);

  return fullOrder;
}

export async function addItemsToOrder(orderId: string, itemsValue: unknown, user: AuthenticatedUser) {
  const items = normalizeItems(itemsValue);
  const order = await getOrderOrThrow(user.restaurantId, orderId);

  canEditOrder(order, user);

  const products = await fetchAvailableProducts(
    user.restaurantId,
    items.map((item) => item.productId)
  );
  const productById = new Map(products.map((product) => [product.id, product]));
  const orderItemsData = buildOrderItemData(productById, items);

  await prisma.$transaction(async (tx) => {
    for (const item of orderItemsData) {
      await tx.orderItem.create({
        data: {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
          unitPrice: item.unitPrice,
          modifications: {
            create: item.modifications
          }
        }
      } as never);
    }

    await tx.order.update({
      where: {
        id: orderId
      },
      data: {
        status: ACTIVE_STATUS
      }
    });

    await tx.table.update({
      where: {
        id: order.tableId
      },
      data: {
        status: "OCCUPIED"
      }
    });
  });

  const fullOrder = await loadOrderWithItems(orderId);

  emitToRestaurant("order:updated", user.restaurantId, fullOrder);
  emitToRestaurant("order:itemAdded", user.restaurantId, fullOrder);
  void sendKitchenPrintJob(user.restaurantId, fullOrder as never).catch((error) => {
    console.error("Kitchen relay print failed for added items", error);
  });

  return fullOrder;
}
