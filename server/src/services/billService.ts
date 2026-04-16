import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { emitToRestaurant } from "../socket/socketEmitter.js";
import { sendReceiptPrintJob } from "./relay.service.js";

type PaymentMethod = "CASH" | "CARD" | "MIXED";

type CreateBillInput = {
  tableId?: unknown;
  paymentMethod?: unknown;
  cashAmount?: unknown;
  cardAmount?: unknown;
};

type UpdateBillInput = {
  paymentMethod?: unknown;
  cashAmount?: unknown;
  cardAmount?: unknown;
};

type ListBillsInput = {
  from?: unknown;
  to?: unknown;
  paymentMethod?: unknown;
  waiterId?: unknown;
  page?: unknown;
  limit?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
};

type PreviewItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

function normalizeId(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !["CASH", "CARD", "MIXED"].includes(value)) {
    throw createHttpError(400, "Metodo de pago no valido");
  }

  return value as PaymentMethod;
}

function normalizeOptionalAmount(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw createHttpError(400, `${fieldName} must be a number greater than or equal to 0`);
  }

  return Number(value.toFixed(2));
}

function decimalToNumber(value: { toNumber(): number }) {
  return Number(value.toNumber().toFixed(2));
}

function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

function buildReopenedTableName(originalTableId: string, originalTableNumber: number) {
  return `__REOPEN__:${originalTableId}:Mesa reabierta ${originalTableNumber}`;
}

function parseReopenedTableName(value: string | null | undefined) {
  if (!value || !value.startsWith("__REOPEN__:")) {
    return null;
  }

  const parts = value.split(":");
  if (parts.length < 3) {
    return null;
  }

  return {
    originalTableId: parts[1] ?? "",
    label: parts.slice(2).join(":")
  };
}

function normalizeDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${fieldName} must be a valid ISO date`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid ISO date`);
  }

  return parsed;
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  return value.trim();
}

function normalizePage(value: unknown, fallback: number) {
  const numericValue =
    typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : fallback;

  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }

  return Math.trunc(numericValue);
}

function normalizeLimit(value: unknown, fallback: number) {
  return Math.min(normalizePage(value, fallback), 100);
}

function normalizeSortBy(value: unknown) {
  if (
    value === "paidAt" ||
    value === "total" ||
    value === "createdAt" ||
    value === "subtotal" ||
    value === "tax" ||
    value === "paymentMethod"
  ) {
    return value;
  }

  return "paidAt" as const;
}

function normalizeSortOrder(value: unknown) {
  if (value === "asc" || value === "desc") {
    return value;
  }

  return "desc" as const;
}

function normalizePaymentMethodFilter(value: unknown): PaymentMethod | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizePaymentMethod(value);
}

async function getTableOrThrow(restaurantId: string, tableId: string) {
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

async function getBillableOrders(tableId: string, restaurantId: string) {
  const orders = await prisma.order.findMany({
    where: {
      tableId,
      billId: null,
      status: "ACTIVE" as never,
      table: {
        restaurantId
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });

  return orders as Array<{
    id: string;
    items: Array<{
      quantity: number;
      unitPrice: { toNumber(): number };
      product: { name: string };
    }>;
  }>;
}

function buildPreviewItems(
  orders: Array<{
    items: Array<{
      quantity: number;
      unitPrice: { toNumber(): number };
      product: { name: string };
    }>;
  }>
) {
  const grouped = new Map<string, PreviewItem>();

  for (const order of orders) {
    for (const item of order.items) {
      const unitPrice = decimalToNumber(item.unitPrice);
      const total = roundAmount(item.quantity * unitPrice);
      const key = `${item.product.name}:${unitPrice}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.total = roundAmount(existing.total + total);
      } else {
        grouped.set(key, {
          name: item.product.name,
          quantity: item.quantity,
          unitPrice,
          total
        });
      }
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildTotals(items: PreviewItem[]) {
  const total = roundAmount(items.reduce((sum, item) => sum + item.total, 0));
  const base = roundAmount(total / 1.1);
  const tax = roundAmount(total - base);

  return {
    subtotal: base,
    tax,
    total
  };
}

async function loadBillWithDetail(billId: string) {
  return prisma.bill.findUniqueOrThrow({
    where: {
      id: billId
    },
    include: {
      table: true,
      orders: {
        include: {
          waiter: {
            select: {
              id: true,
              name: true,
              role: true
            }
          },
          items: {
            include: {
              product: true
            }
          }
        }
      }
    }
  });
}

function mapBillDetail(
  bill: Awaited<ReturnType<typeof loadBillWithDetail>>
) {
  const groupedItems = new Map<
    string,
    { name: string; quantity: number; unitPrice: number; subtotal: number }
  >();

  for (const order of bill.orders) {
    for (const item of order.items) {
      const unitPrice = decimalToNumber(item.unitPrice);
      const key = `${item.product.name}:${unitPrice}`;
      const existing = groupedItems.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.subtotal = roundAmount(existing.subtotal + item.quantity * unitPrice);
      } else {
        groupedItems.set(key, {
          name: item.product.name,
          quantity: item.quantity,
          unitPrice,
          subtotal: roundAmount(item.quantity * unitPrice)
        });
      }
    }
  }

  const primaryOrder = bill.orders[0] ?? null;

  return {
    id: bill.id,
    paidAt: bill.paidAt.toISOString(),
    createdAt: bill.createdAt.toISOString(),
    subtotal: decimalToNumber(bill.subtotal),
    tax: decimalToNumber(bill.tax),
    total: decimalToNumber(bill.total),
    paymentMethod: bill.paymentMethod,
    cashAmount: bill.cashAmount ? decimalToNumber(bill.cashAmount) : null,
    cardAmount: bill.cardAmount ? decimalToNumber(bill.cardAmount) : null,
    table: {
      id: bill.table.id,
      number: bill.table.number,
      name: bill.table.name
    },
    waiter: primaryOrder?.waiter
      ? {
          id: primaryOrder.waiter.id,
          name: primaryOrder.waiter.name,
          role: primaryOrder.waiter.role
        }
      : null,
    itemsCount: bill.orders.reduce(
      (sum, order) => sum + order.items.reduce((orderSum, item) => orderSum + item.quantity, 0),
      0
    ),
    items: Array.from(groupedItems.values()).sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function getBillPreview(tableId: string, user: AuthenticatedUser) {
  const table = await getTableOrThrow(user.restaurantId, tableId);
  const orders = await getBillableOrders(tableId, user.restaurantId);
  const items = buildPreviewItems(orders);
  const totals = buildTotals(items);

  return {
    items,
    ...totals,
    tableNumber: table.number
  };
}

export async function createBill(input: CreateBillInput, user: AuthenticatedUser) {
  const tableId = normalizeId(input.tableId, "tableId");
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);
  const normalizedCashAmount = normalizeOptionalAmount(input.cashAmount, "cashAmount");
  const normalizedCardAmount = normalizeOptionalAmount(input.cardAmount, "cardAmount");

  const table = await getTableOrThrow(user.restaurantId, tableId);
  const reopenedMeta = parseReopenedTableName(table.name);

  const orders = await getBillableOrders(tableId, user.restaurantId);

  if (orders.length === 0) {
    throw createHttpError(400, "No hay pedidos activos para cobrar en esta mesa");
  }

  const previewItems = buildPreviewItems(orders);
  const totals = buildTotals(previewItems);
  const cashAmount =
    paymentMethod === "CARD" ? null : normalizedCashAmount;
  const cardAmount =
    paymentMethod === "CARD" ? totals.total : normalizedCardAmount;

  if (paymentMethod === "CASH" && cashAmount === null) {
    throw createHttpError(400, "Introduce la cantidad recibida en efectivo");
  }

  if (paymentMethod === "MIXED") {
    if (cashAmount === null || cardAmount === null) {
      throw createHttpError(400, "Introduce los importes de efectivo y tarjeta");
    }

    if (roundAmount(cashAmount + cardAmount) < totals.total) {
      throw createHttpError(400, "La suma de efectivo y tarjeta debe cubrir el total");
    }
  }

  const bill = await prisma.$transaction(async (tx) => {
    const createdBill = await tx.bill.create({
      data: {
        tableId: reopenedMeta?.originalTableId ?? tableId,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod,
        paidAt: new Date(),
        cashAmount,
        cardAmount
      }
    });

    await tx.order.updateMany({
      where: {
        id: {
          in: orders.map((order) => order.id)
        }
      },
      data: {
        billId: createdBill.id,
        ...(reopenedMeta
          ? {
              tableId: reopenedMeta.originalTableId
            }
          : {})
      }
    });

    if (reopenedMeta) {
      await tx.table.delete({
        where: {
          id: tableId
        }
      });
    } else {
      await tx.table.update({
        where: {
          id: tableId
        },
        data: {
          status: "FREE"
        }
      });
    }

    return createdBill;
  });

  const fullBill = await loadBillWithDetail(bill.id);

  emitToRestaurant("bill:created", user.restaurantId, fullBill);
  emitToRestaurant("table:statusChanged", user.restaurantId, {
    tableId: reopenedMeta?.originalTableId ?? tableId,
    status: "FREE"
  });
  void sendReceiptPrintJob(user.restaurantId, fullBill).catch((error) => {
    console.error("Receipt relay print failed for bill", error);
  });

  return fullBill;
}

export async function printBillReceipt(billId: string, user: AuthenticatedUser) {
  const bill = await prisma.bill.findFirst({
    where: {
      id: billId,
      table: {
        restaurantId: user.restaurantId
      }
    }
  });

  if (!bill) {
    throw createHttpError(404, "Bill not found");
  }

  const fullBill = await loadBillWithDetail(bill.id);
  return sendReceiptPrintJob(user.restaurantId, fullBill, { force: true });
}

export async function reopenBill(billId: string, user: AuthenticatedUser) {
  const bill = await prisma.bill.findFirst({
    where: {
      id: billId,
      table: {
        restaurantId: user.restaurantId
      }
    },
    select: {
      id: true,
      tableId: true,
      table: {
        select: {
          id: true,
          number: true
        }
      },
      orders: {
        select: {
          id: true
        }
      }
    }
  });

  if (!bill) {
    throw createHttpError(404, "Bill not found");
  }

  if (bill.orders.length === 0) {
    throw createHttpError(400, "No se puede reabrir una cuenta sin pedidos");
  }

  const existingReopenedTable = await prisma.table.findFirst({
    where: {
      restaurantId: user.restaurantId,
      name: buildReopenedTableName(bill.tableId, bill.table.number)
    },
    select: {
      id: true
    }
  });

  if (existingReopenedTable) {
    throw createHttpError(400, "Esta cuenta ya esta reabierta");
  }

  const temporaryTable = await prisma.$transaction(async (tx) => {
    const maxTableNumber = await tx.table.aggregate({
      where: {
        restaurantId: user.restaurantId
      },
      _max: {
        number: true
      }
    });

    const temporaryTableNumber = (maxTableNumber._max.number ?? 0) + 1;
    const temporaryTableName = buildReopenedTableName(bill.tableId, bill.table.number);

    const temporaryTable = await tx.table.create({
      data: {
        restaurantId: user.restaurantId,
        number: temporaryTableNumber,
        name: temporaryTableName,
        zone: "Reabiertas",
        capacity: 1,
        status: "OCCUPIED"
      }
    });

    await tx.order.updateMany({
      where: {
        billId: bill.id
      },
      data: {
        billId: null,
        tableId: temporaryTable.id
      }
    });

    await tx.bill.delete({
      where: {
        id: bill.id
      }
    });
    return temporaryTable;
  });

  emitToRestaurant("table:statusChanged", user.restaurantId, {
    tableId: temporaryTable.id,
    status: "OCCUPIED"
  });

  return {
    ok: true,
    tableId: temporaryTable.id,
    tableNumber: bill.table.number
  };
}

export async function updateClosedBill(billId: string, input: UpdateBillInput, user: AuthenticatedUser) {
  const paymentMethod = normalizePaymentMethod(input.paymentMethod);
  const normalizedCashAmount = normalizeOptionalAmount(input.cashAmount, "cashAmount");
  const normalizedCardAmount = normalizeOptionalAmount(input.cardAmount, "cardAmount");

  const bill = await prisma.bill.findFirst({
    where: {
      id: billId,
      table: {
        restaurantId: user.restaurantId
      }
    },
    select: {
      id: true,
      total: true
    }
  });

  if (!bill) {
    throw createHttpError(404, "Bill not found");
  }

  const total = decimalToNumber(bill.total);
  const cashAmount = paymentMethod === "CARD" ? null : normalizedCashAmount;
  const cardAmount = paymentMethod === "CARD" ? total : normalizedCardAmount;

  if (paymentMethod === "CASH" && cashAmount === null) {
    throw createHttpError(400, "Introduce la cantidad recibida en efectivo");
  }

  if (paymentMethod === "MIXED") {
    if (cashAmount === null || cardAmount === null) {
      throw createHttpError(400, "Introduce los importes de efectivo y tarjeta");
    }

    if (roundAmount(cashAmount + cardAmount) < total) {
      throw createHttpError(400, "La suma de efectivo y tarjeta debe cubrir el total");
    }
  }

  await prisma.bill.update({
    where: {
      id: bill.id
    },
    data: {
      paymentMethod,
      cashAmount,
      cardAmount
    }
  });

  const fullBill = await loadBillWithDetail(bill.id);
  return mapBillDetail(fullBill);
}

export async function listBills(input: ListBillsInput, user: AuthenticatedUser) {
  const from = normalizeDate(input.from, "from");
  const to = normalizeDate(input.to, "to");
  const paymentMethod = normalizePaymentMethodFilter(input.paymentMethod);
  const waiterId = normalizeOptionalString(input.waiterId);
  const page = normalizePage(input.page, 1);
  const limit = normalizeLimit(input.limit, 25);
  const sortBy = normalizeSortBy(input.sortBy);
  const sortOrder = normalizeSortOrder(input.sortOrder);

  const where = {
    table: {
      restaurantId: user.restaurantId
    },
    ...(from || to
      ? {
          paidAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(waiterId
      ? {
          orders: {
            some: {
              waiterId
            }
          }
        }
      : {})
  };

  const [total, bills] = await prisma.$transaction([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        table: true,
        orders: {
          include: {
            waiter: {
              select: {
                id: true,
                name: true,
                role: true
              }
            },
            items: {
              include: {
                product: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    })
  ]);

  const summarySource = await prisma.bill.findMany({
    where,
    include: {
      orders: {
        select: {
          waiter: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  const rows = bills.map((bill, index) => {
    const primaryOrder = bill.orders[0] ?? null;
    const itemsCount = bill.orders.reduce(
      (sum, order) => sum + order.items.reduce((orderSum, item) => orderSum + item.quantity, 0),
      0
    );

    return {
      id: bill.id,
      number: total - (page - 1) * limit - index,
      paidAt: bill.paidAt.toISOString(),
      tableLabel: bill.table.name?.trim() ? bill.table.name : `Mesa ${bill.table.number}`,
      tableNumber: bill.table.number,
      waiter: primaryOrder?.waiter
        ? {
            id: primaryOrder.waiter.id,
            name: primaryOrder.waiter.name
          }
        : null,
      items: itemsCount,
      subtotal: decimalToNumber(bill.subtotal),
      tax: decimalToNumber(bill.tax),
      total: decimalToNumber(bill.total),
      paymentMethod: bill.paymentMethod,
      cashAmount: bill.cashAmount ? decimalToNumber(bill.cashAmount) : 0,
      cardAmount: bill.cardAmount ? decimalToNumber(bill.cardAmount) : 0
    };
  });

  const summary = summarySource.reduce(
    (acc, bill) => {
      const totalAmount = decimalToNumber(bill.total);
      const cashAmount = bill.cashAmount ? decimalToNumber(bill.cashAmount) : bill.paymentMethod === "CASH" ? totalAmount : 0;
      const cardAmount = bill.cardAmount ? decimalToNumber(bill.cardAmount) : bill.paymentMethod === "CARD" ? totalAmount : 0;

      acc.totalAmount = roundAmount(acc.totalAmount + totalAmount);
      acc.cashAmount = roundAmount(acc.cashAmount + cashAmount);
      acc.cardAmount = roundAmount(acc.cardAmount + cardAmount);
      acc.count += 1;
      return acc;
    },
    {
      totalAmount: 0,
      cashAmount: 0,
      cardAmount: 0,
      count: 0
    }
  );

  return {
    data: rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary: {
      ...summary,
      averageTicket: summary.count > 0 ? roundAmount(summary.totalAmount / summary.count) : 0
    }
  };
}

export async function getBillById(billId: string, user: AuthenticatedUser) {
  const bill = await prisma.bill.findFirst({
    where: {
      id: billId,
      table: {
        restaurantId: user.restaurantId
      }
    }
  });

  if (!bill) {
    throw createHttpError(404, "Bill not found");
  }

  const fullBill = await loadBillWithDetail(bill.id);
  return mapBillDetail(fullBill);
}
