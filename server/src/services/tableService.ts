import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import { emitToRestaurant } from "../socket/socketEmitter.js";

type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";

type TableInput = {
  number?: unknown;
  name?: unknown;
  capacity?: unknown;
  zone?: unknown;
  status?: unknown;
};

type BulkTableInput = {
  fromNumber?: unknown;
  toNumber?: unknown;
  capacity?: unknown;
  zone?: unknown;
  status?: unknown;
};

const ACTIVE_ORDER_STATUSES = ["ACTIVE"] as const;
const TABLE_STATUSES = ["FREE", "OCCUPIED", "RESERVED"] as const;

function normalizeTableNumber(value: unknown, fieldName = "Table number") {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw createHttpError(400, `${fieldName} must be an integer greater than 0`);
  }

  return value;
}

function normalizeCapacity(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw createHttpError(400, "Capacity must be an integer greater than 0");
  }

  return value;
}

function normalizeOptionalName(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "Name must be a string");
  }

  return value.trim() || null;
}

function normalizeZone(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "Interior";
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "Zone must be a string");
  }

  const zone = value.trim();

  if (zone.length === 0) {
    return "Interior";
  }

  return zone;
}

function normalizeStatus(value: unknown) {
  if (
    typeof value !== "string" ||
    !TABLE_STATUSES.includes(value as (typeof TABLE_STATUSES)[number])
  ) {
    throw createHttpError(400, "Invalid table status");
  }

  return value as TableStatus;
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

async function ensureTableNumberAvailable(
  restaurantId: string,
  number: number,
  exceptTableId?: string
) {
  const existing = await prisma.table.findFirst({
    where: {
      restaurantId,
      number,
      ...(exceptTableId
        ? {
            id: {
              not: exceptTableId
            }
          }
        : {})
    }
  });

  if (existing) {
    throw createHttpError(400, `Table number ${number} already exists in this restaurant`);
  }
}

function getPartialTotal(
  orders: Array<{
    status: string;
    items: Array<{ quantity: number; unitPrice: { toNumber(): number } }>;
  }>
) {
  const total = orders
    .filter((order) => order.status !== "CANCELLED")
    .reduce((sum, order) => {
      const orderTotal = order.items.reduce(
        (itemsSum, item) => itemsSum + item.quantity * item.unitPrice.toNumber(),
        0
      );

      return sum + orderTotal;
    }, 0);

  return Number(total.toFixed(2));
}

function mapTableSummary(table: {
  id: string;
  number: number;
  name: string | null;
  zone: string;
  capacity: number;
  restaurantId: string;
  status: string;
  orders: Array<{
    createdAt?: Date;
    status: string;
    waiter?: {
      id: string;
      name: string;
    } | null;
    items: Array<{ quantity: number; unitPrice: { toNumber(): number } }>;
  }>;
}) {
  const activeOrdersCount = table.orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.includes(order.status as (typeof ACTIVE_ORDER_STATUSES)[number])
  ).length;
  const activeOrders = table.orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.includes(order.status as (typeof ACTIVE_ORDER_STATUSES)[number])
  );
  const firstActiveOrder = [...activeOrders].sort((left, right) => {
    const leftTime = left.createdAt ? left.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt ? right.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  })[0];

  return {
    id: table.id,
    number: table.number,
    name: table.name,
    zone: table.zone,
    capacity: table.capacity,
    restaurantId: table.restaurantId,
    status: table.status,
    summary:
      table.status === "OCCUPIED"
        ? {
            activeOrdersCount,
            partialTotal: getPartialTotal(table.orders),
            occupiedSince: firstActiveOrder?.createdAt?.toISOString() ?? null,
            openedBy: firstActiveOrder?.waiter
              ? {
                  id: firstActiveOrder.waiter.id,
                  name: firstActiveOrder.waiter.name
                }
              : null
          }
        : null
  };
}

export async function listTablesWithStatus(restaurantId: string) {
  const tables = (await prisma.table.findMany({
    where: {
      restaurantId
    },
    orderBy: {
      number: "asc"
    },
    include: {
      orders: {
        where: {
          status: {
            not: "CANCELLED"
          }
        },
        select: {
          createdAt: true,
          status: true,
          waiter: {
            select: {
              id: true,
              name: true
            }
          },
          items: {
            select: {
              quantity: true,
              unitPrice: true
            }
          }
        }
      }
    }
  })) as Array<{
    id: string;
    number: number;
    name: string | null;
    zone: string;
    capacity: number;
    restaurantId: string;
    status: string;
    orders: Array<{
      createdAt?: Date;
      status: string;
      waiter?: {
        id: string;
        name: string;
      } | null;
      items: Array<{ quantity: number; unitPrice: { toNumber(): number } }>;
    }>;
  }>;

  const flatTables = tables.map(mapTableSummary).sort((left, right) => {
    const zoneComparison = left.zone.localeCompare(right.zone);
    if (zoneComparison !== 0) {
      return zoneComparison;
    }

    return left.number - right.number;
  });
  const zonesMap = new Map<string, typeof flatTables>();

  for (const table of flatTables) {
    const current = zonesMap.get(table.zone) ?? [];
    current.push(table);
    zonesMap.set(table.zone, current);
  }

  return {
    tables: flatTables,
    zones: Array.from(zonesMap.entries()).map(([name, zoneTables]) => ({
      name,
      count: zoneTables.length,
      tables: zoneTables.sort((left, right) => left.number - right.number)
    }))
  };
}

export async function createTable(restaurantId: string, input: TableInput) {
  const number = normalizeTableNumber(input.number);
  const name = normalizeOptionalName(input.name);
  const zone = normalizeZone(input.zone);
  const capacity = normalizeCapacity(input.capacity);
  const status = input.status === undefined ? "FREE" : normalizeStatus(input.status);

  await ensureTableNumberAvailable(restaurantId, number);

  return prisma.table.create({
    data: {
      number,
      name,
      zone,
      capacity,
      restaurantId,
      status
    } as never
  });
}

export async function createTablesBulk(restaurantId: string, input: BulkTableInput) {
  const fromNumber = normalizeTableNumber(input.fromNumber, "From number");
  const toNumber = normalizeTableNumber(input.toNumber, "To number");
  const capacity = normalizeCapacity(input.capacity);
  const zone = normalizeZone(input.zone);
  const status = input.status === undefined ? "FREE" : normalizeStatus(input.status);

  if (toNumber < fromNumber) {
    throw createHttpError(400, "toNumber must be greater than or equal to fromNumber");
  }

  const numbers = Array.from(
    { length: toNumber - fromNumber + 1 },
    (_, index) => fromNumber + index
  );
  const existing = await prisma.table.findMany({
    where: {
      restaurantId,
      number: {
        in: numbers
      }
    },
    select: {
      number: true
    }
  });

  if (existing.length > 0) {
    throw createHttpError(
      400,
      `Table numbers already exist: ${existing.map((table) => table.number).join(", ")}`
    );
  }

  await prisma.table.createMany({
    data: numbers.map((number) => ({
      number,
      name: zone === "Interior" ? null : `${zone} ${number}`,
      zone,
      capacity,
      restaurantId,
      status
    }))
  });

  return listTablesWithStatus(restaurantId);
}

export async function updateTable(restaurantId: string, tableId: string, input: TableInput) {
  await ensureTableBelongsToRestaurant(restaurantId, tableId);

  const data: {
    number?: number;
    name?: string | null;
    zone?: string;
    capacity?: number;
    status?: TableStatus;
  } = {};

  if (input.number !== undefined) {
    const nextNumber = normalizeTableNumber(input.number);
    await ensureTableNumberAvailable(restaurantId, nextNumber, tableId);
    data.number = nextNumber;
  }

  if (input.name !== undefined) {
    data.name = normalizeOptionalName(input.name);
  }

  if (input.zone !== undefined) {
    data.zone = normalizeZone(input.zone);
  }

  if (input.capacity !== undefined) {
    data.capacity = normalizeCapacity(input.capacity);
  }

  if (input.status !== undefined) {
    data.status = normalizeStatus(input.status);
  }

  return prisma.table.update({
    where: {
      id: tableId
    },
    data
  });
}

export async function deleteTable(restaurantId: string, tableId: string) {
  const table = await ensureTableBelongsToRestaurant(restaurantId, tableId);

  if (table.status !== "FREE") {
    throw createHttpError(400, "No se puede eliminar una mesa con servicio activo");
  }

  await prisma.table.delete({
    where: {
      id: tableId
    }
  });

  return {
    id: tableId,
    deleted: true
  };
}

export async function updateTableStatus(
  restaurantId: string,
  tableId: string,
  nextStatusValue: unknown
) {
  await ensureTableBelongsToRestaurant(restaurantId, tableId);
  const nextStatus = normalizeStatus(nextStatusValue);

  if (nextStatus === "FREE") {
    const pendingOrdersCount = await prisma.order.count({
      where: {
        tableId,
        status: {
          in: [...ACTIVE_ORDER_STATUSES] as never
        }
      }
    });

    if (pendingOrdersCount > 0) {
      throw createHttpError(400, "Cannot set table to FREE while it has active orders");
    }
  }

  const updatedTable = await prisma.table.update({
    where: {
      id: tableId
    },
    data: {
      status: nextStatus
    }
  });

  emitToRestaurant("table:statusChanged", restaurantId, {
    tableId,
    status: updatedTable.status
  });

  return updatedTable;
}
