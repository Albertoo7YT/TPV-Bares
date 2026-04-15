import { prisma } from "../lib/prisma.js";
import type { AuthenticatedUser } from "../types/auth.js";

type DashboardStatsResponse = {
  totalSales: MetricComparison;
  totalOrders: MetricComparison;
  averageTicket: MetricComparison;
  activeTables: MetricComparison;
  salesByHour: Array<{ hour: string; total: number }>;
  topProducts: Array<{ name: string; quantity: number; total: number }>;
  recentBills: Array<{
    id: string;
    paidAt: string;
    tableLabel: string;
    waiterName: string;
    items: number;
    total: number;
    paymentMethod: "CASH" | "CARD" | "MIXED";
  }>;
};

type MetricComparison = {
  current: number;
  previous: number | null;
  changePercent: number | null;
};

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

function decimalToNumber(value: { toNumber(): number } | null | undefined) {
  if (!value) {
    return 0;
  }

  return roundAmount(value.toNumber());
}

function buildComparison(current: number, previous: number | null) {
  if (previous === null) {
    return {
      current,
      previous,
      changePercent: null
    };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current > 0 ? 100 : 0
    };
  }

  return {
    current,
    previous,
    changePercent: roundAmount(((current - previous) / previous) * 100)
  };
}

export async function getDashboardStats(
  user: AuthenticatedUser
): Promise<DashboardStatsResponse> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);

  const [todayBills, yesterdayBills, activeTablesCount, yesterdayActiveTablesCount] =
    await Promise.all([
      prisma.bill.findMany({
        where: {
          table: {
            restaurantId: user.restaurantId
          },
          paidAt: {
            gte: todayStart,
            lte: todayEnd
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
                  name: true
                }
              },
              items: {
                select: {
                  quantity: true,
                  product: {
                    select: {
                      name: true
                    }
                  },
                  unitPrice: true
                }
              }
            }
          }
        }
      }),
      prisma.bill.findMany({
        where: {
          table: {
            restaurantId: user.restaurantId
          },
          paidAt: {
            gte: yesterdayStart,
            lte: yesterdayEnd
          }
        },
        include: {
          orders: {
            include: {
              items: {
                select: {
                  quantity: true
                }
              }
            }
          }
        }
      }),
      prisma.table.count({
        where: {
          restaurantId: user.restaurantId,
          status: "OCCUPIED"
        }
      }),
      prisma.table.count({
        where: {
          restaurantId: user.restaurantId,
          orders: {
            some: {
              createdAt: {
                gte: yesterdayStart,
                lte: yesterdayEnd
              },
              status: {
                not: "CANCELLED"
              }
            }
          }
        }
      })
    ]);

  const totalSales = roundAmount(
    todayBills.reduce((sum, bill) => sum + decimalToNumber(bill.total), 0)
  );
  const yesterdaySales = roundAmount(
    yesterdayBills.reduce((sum, bill) => sum + decimalToNumber(bill.total), 0)
  );

  const totalOrders = todayBills.reduce((sum, bill) => sum + bill.orders.length, 0);
  const yesterdayOrders = yesterdayBills.reduce((sum, bill) => sum + bill.orders.length, 0);
  const averageTicket = todayBills.length > 0 ? roundAmount(totalSales / todayBills.length) : 0;
  const yesterdayAverageTicket =
    yesterdayBills.length > 0 ? roundAmount(yesterdaySales / yesterdayBills.length) : 0;

  const currentHour = now.getHours();
  const salesByHour = Array.from({ length: Math.max(currentHour - 9, 0) }, (_, index) => {
    const hour = index + 10;
    const hourLabel = `${String(hour).padStart(2, "0")}:00`;
    const total = todayBills
      .filter((bill) => new Date(bill.paidAt).getHours() === hour)
      .reduce((sum, bill) => sum + decimalToNumber(bill.total), 0);

    return {
      hour: hourLabel,
      total: roundAmount(total)
    };
  });

  const topProductsMap = new Map<string, { name: string; quantity: number; total: number }>();

  for (const bill of todayBills) {
    for (const order of bill.orders) {
      for (const item of order.items) {
        const current = topProductsMap.get(item.product.name) ?? {
          name: item.product.name,
          quantity: 0,
          total: 0
        };

        current.quantity += item.quantity;
        current.total = roundAmount(
          current.total + item.quantity * decimalToNumber(item.unitPrice)
        );
        topProductsMap.set(item.product.name, current);
      }
    }
  }

  const topProducts = Array.from(topProductsMap.values())
    .sort((left, right) => {
      if (right.quantity !== left.quantity) {
        return right.quantity - left.quantity;
      }

      return right.total - left.total;
    })
    .slice(0, 5);

  const recentBills = todayBills.slice(0, 10).map((bill) => {
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

  return {
    totalSales: buildComparison(totalSales, yesterdaySales),
    totalOrders: buildComparison(totalOrders, yesterdayOrders),
    averageTicket: buildComparison(averageTicket, yesterdayAverageTicket),
    activeTables: buildComparison(activeTablesCount, yesterdayActiveTablesCount),
    salesByHour,
    topProducts,
    recentBills
  };
}

export async function getTpvQuickStats(user: AuthenticatedUser) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [activeTables, totalTables, activeOrders, todayBills] = await Promise.all([
    prisma.table.count({
      where: {
        restaurantId: user.restaurantId,
        status: "OCCUPIED"
      }
    }),
    prisma.table.count({
      where: {
        restaurantId: user.restaurantId
      }
    }),
    prisma.order.count({
      where: {
        status: "ACTIVE" as never,
        billId: null,
        table: {
          restaurantId: user.restaurantId
        }
      }
    }),
    prisma.bill.findMany({
      where: {
        table: {
          restaurantId: user.restaurantId
        },
        paidAt: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      select: {
        total: true
      }
    })
  ]);

  return {
    activeTables,
    totalTables,
    pendingOrders: activeOrders,
    todaySales: roundAmount(todayBills.reduce((sum, bill) => sum + decimalToNumber(bill.total), 0))
  };
}
