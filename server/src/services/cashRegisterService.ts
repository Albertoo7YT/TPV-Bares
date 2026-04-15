import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import type { AuthenticatedUser } from "../types/auth.js";

type OpenCashRegisterInput = {
  initialCash?: unknown;
};

type CloseCashRegisterInput = {
  realCash?: unknown;
  notes?: unknown;
};

function normalizeAmount(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw createHttpError(400, `${fieldName} must be a number greater than or equal to 0`);
  }

  return Number(value.toFixed(2));
}

function decimalToNumber(value: { toNumber(): number } | null | undefined) {
  if (!value) {
    return 0;
  }

  return Number(value.toNumber().toFixed(2));
}

function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

function normalizeNotes(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "notes must be a string");
  }

  return value.trim() || null;
}

async function getOpenCashRegister(restaurantId: string) {
  return prisma.cashRegister.findFirst({
    where: {
      restaurantId,
      closedAt: null
    },
    orderBy: {
      openedAt: "desc"
    },
    include: {
      openedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });
}

async function getBillsBetween(restaurantId: string, from: Date, to: Date) {
  return prisma.bill.findMany({
    where: {
      table: {
        restaurantId
      },
      paidAt: {
        gte: from,
        lte: to
      }
    },
    orderBy: {
      paidAt: "desc"
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
            select: {
              quantity: true
            }
          }
        }
      }
    }
  });
}

function calculateTotals(
  bills: Array<{
    paymentMethod: string;
    total: { toNumber(): number };
    cashAmount: { toNumber(): number } | null;
    cardAmount: { toNumber(): number } | null;
  }>
) {
  return bills.reduce(
    (accumulator, bill) => {
      const billTotal = decimalToNumber(bill.total);
      let cash = 0;
      let card = 0;

      if (bill.paymentMethod === "CASH") {
        cash = bill.cashAmount ? decimalToNumber(bill.cashAmount) : billTotal;
      } else if (bill.paymentMethod === "CARD") {
        card = bill.cardAmount ? decimalToNumber(bill.cardAmount) : billTotal;
      } else {
        cash = decimalToNumber(bill.cashAmount);
        card = decimalToNumber(bill.cardAmount);
      }

      accumulator.totalCash += cash;
      accumulator.totalCard += card;
      accumulator.totalSales += billTotal;

      return accumulator;
    },
    {
      totalCash: 0,
      totalCard: 0,
      totalSales: 0
    }
  );
}

function mapBillsForTurn(
  bills: Array<{
    id: string;
    paidAt: Date;
    total: { toNumber(): number };
    paymentMethod: "CASH" | "CARD" | "MIXED";
    table: { number: number; name: string | null };
    orders: Array<{
      waiter: { id: string; name: string; role: string } | null;
      items: Array<{ quantity: number }>;
    }>;
  }>
) {
  return bills.map((bill) => {
    const waiterNames = Array.from(
      new Set(
        bill.orders
          .map((order) => order.waiter?.name?.trim())
          .filter((value): value is string => Boolean(value))
      )
    );
    const totalItems = bill.orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );

    return {
      id: bill.id,
      paidAt: bill.paidAt.toISOString(),
      tableLabel: bill.table.name
        ? `Mesa ${bill.table.number} · ${bill.table.name}`
        : `Mesa ${bill.table.number}`,
      waiterName: waiterNames.join(", ") || "-",
      items: totalItems,
      total: decimalToNumber(bill.total),
      paymentMethod: bill.paymentMethod
    };
  });
}

export async function openCashRegister(input: OpenCashRegisterInput, user: AuthenticatedUser) {
  const initialCash = normalizeAmount(input.initialCash, "initialCash");
  const existing = await getOpenCashRegister(user.restaurantId);

  if (existing) {
    throw createHttpError(400, "There is already an open cash register");
  }

  return prisma.cashRegister.create({
    data: {
      restaurantId: user.restaurantId,
      openedById: user.userId,
      initialCash,
      totalCash: 0,
      totalCard: 0,
      totalSales: 0
    },
    include: {
      openedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });
}

export async function getCurrentCashRegister(user: AuthenticatedUser) {
  const cashRegister = await getOpenCashRegister(user.restaurantId);

  if (!cashRegister) {
    return null;
  }

  const bills = await getBillsBetween(user.restaurantId, cashRegister.openedAt, new Date());
  const totals = calculateTotals(bills);
  const expectedCash = roundAmount(decimalToNumber(cashRegister.initialCash) + totals.totalCash);

  return {
    id: cashRegister.id,
    openedAt: cashRegister.openedAt.toISOString(),
    initialCash: decimalToNumber(cashRegister.initialCash),
    totalCash: roundAmount(totals.totalCash),
    totalCard: roundAmount(totals.totalCard),
    totalSales: roundAmount(totals.totalSales),
    expectedCash,
    openedBy: cashRegister.openedBy
      ? {
          id: cashRegister.openedBy.id,
          name: cashRegister.openedBy.name,
          role: cashRegister.openedBy.role
        }
      : null,
    bills: mapBillsForTurn(bills)
  };
}

export async function closeCashRegister(input: CloseCashRegisterInput, user: AuthenticatedUser) {
  const cashRegister = await getOpenCashRegister(user.restaurantId);

  if (!cashRegister) {
    throw createHttpError(400, "There is no open cash register");
  }

  const realCash = normalizeAmount(input.realCash, "realCash");
  const closedAt = new Date();
  const notes = normalizeNotes(input.notes);
  const bills = await getBillsBetween(user.restaurantId, cashRegister.openedAt, closedAt);
  const totals = calculateTotals(bills);
  const expectedCash = roundAmount(decimalToNumber(cashRegister.initialCash) + totals.totalCash);
  const difference = roundAmount(realCash - expectedCash);

  const closedRegister = await prisma.cashRegister.update({
    where: {
      id: cashRegister.id
    },
    data: {
      closedAt,
      closedById: user.userId,
      totalCash: roundAmount(totals.totalCash),
      totalCard: roundAmount(totals.totalCard),
      totalSales: roundAmount(totals.totalSales),
      realCash,
      difference,
      notes
    } as never,
    include: {
      openedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      closedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });

  return {
    ...closedRegister,
    initialCash: decimalToNumber(closedRegister.initialCash),
    totalCash: decimalToNumber(closedRegister.totalCash),
    totalCard: decimalToNumber(closedRegister.totalCard),
    totalSales: decimalToNumber(closedRegister.totalSales),
    realCash: decimalToNumber((closedRegister as { realCash?: { toNumber(): number } | null }).realCash),
    difference: decimalToNumber((closedRegister as { difference?: { toNumber(): number } | null }).difference),
    expectedCash
  };
}

export async function getCashRegisterHistory(user: AuthenticatedUser) {
  const cashRegisters = await prisma.cashRegister.findMany({
    where: {
      restaurantId: user.restaurantId,
      closedAt: {
        not: null
      }
    },
    orderBy: {
      closedAt: "desc"
    },
    take: 30,
    include: {
      openedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      closedBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });

  return cashRegisters.map((cashRegister) => ({
    ...cashRegister,
    initialCash: decimalToNumber(cashRegister.initialCash),
    totalCash: decimalToNumber(cashRegister.totalCash),
    totalCard: decimalToNumber(cashRegister.totalCard),
    totalSales: decimalToNumber(cashRegister.totalSales),
    realCash: (cashRegister as { realCash?: { toNumber(): number } | null }).realCash
      ? decimalToNumber((cashRegister as { realCash?: { toNumber(): number } | null }).realCash)
      : null,
    difference: (cashRegister as { difference?: { toNumber(): number } | null }).difference
      ? decimalToNumber((cashRegister as { difference?: { toNumber(): number } | null }).difference)
      : null
  }));
}
