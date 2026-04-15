import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import type { AuthenticatedUser } from "../types/auth.js";

type ReportsQuery = {
  from?: unknown;
  to?: unknown;
};

type TimeGranularity = "hour" | "day";

function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

function normalizeDate(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${fieldName} must be a valid ISO date`);
  }

  return parsed;
}

function getGranularity(from: Date, to: Date): TimeGranularity {
  const diffInHours = Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 36 ? "hour" : "day";
}

function formatTimeBucket(value: Date, granularity: TimeGranularity) {
  if (granularity === "hour") {
    return new Intl.DateTimeFormat("sv-SE", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(value);
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

export async function getReportsStats(query: ReportsQuery, user: AuthenticatedUser) {
  const from = normalizeDate(query.from, "from");
  const to = normalizeDate(query.to, "to");

  if (from > to) {
    throw createHttpError(400, "from must be earlier than to");
  }

  const granularity = getGranularity(from, to);
  const bucketSql =
    granularity === "hour"
      ? Prisma.sql`date_trunc('hour', b."paidAt")`
      : Prisma.sql`date_trunc('day', b."paidAt")`;

  const [salesOverTimeRows, salesByCategoryRows, topProductsRows, waiterRows, heatmapRows, paymentRows] =
    await Promise.all([
      prisma.$queryRaw<Array<{ bucket: Date; total: Prisma.Decimal }>>(Prisma.sql`
        SELECT ${bucketSql} AS bucket, SUM(b."total") AS total
        FROM "Bill" b
        INNER JOIN "Table" t ON t."id" = b."tableId"
        WHERE t."restaurantId" = ${user.restaurantId}
          AND b."paidAt" >= ${from}
          AND b."paidAt" <= ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      prisma.$queryRaw<
        Array<{ categoryName: string; total: Prisma.Decimal; quantity: bigint }>
      >(Prisma.sql`
        SELECT c."name" AS "categoryName",
               SUM(oi."quantity" * oi."unitPrice") AS total,
               SUM(oi."quantity")::bigint AS quantity
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        INNER JOIN "Bill" b ON b."id" = o."billId"
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Category" c ON c."id" = p."categoryId"
        INNER JOIN "Table" t ON t."id" = b."tableId"
        WHERE t."restaurantId" = ${user.restaurantId}
          AND b."paidAt" >= ${from}
          AND b."paidAt" <= ${to}
          AND oi."status" != 'CANCELLED'
        GROUP BY c."name"
        ORDER BY total DESC, quantity DESC
      `),
      prisma.$queryRaw<
        Array<{
          productName: string;
          categoryName: string;
          total: Prisma.Decimal;
          quantity: bigint;
        }>
      >(Prisma.sql`
        SELECT p."name" AS "productName",
               c."name" AS "categoryName",
               SUM(oi."quantity" * oi."unitPrice") AS total,
               SUM(oi."quantity")::bigint AS quantity
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        INNER JOIN "Bill" b ON b."id" = o."billId"
        INNER JOIN "Product" p ON p."id" = oi."productId"
        INNER JOIN "Category" c ON c."id" = p."categoryId"
        INNER JOIN "Table" t ON t."id" = b."tableId"
        WHERE t."restaurantId" = ${user.restaurantId}
          AND b."paidAt" >= ${from}
          AND b."paidAt" <= ${to}
          AND oi."status" != 'CANCELLED'
        GROUP BY p."name", c."name"
        ORDER BY quantity DESC, total DESC
        LIMIT 10
      `),
      prisma.$queryRaw<
        Array<{
          waiterName: string;
          orders: bigint;
          totalSales: Prisma.Decimal;
          averageTicket: Prisma.Decimal;
          tablesServed: bigint;
        }>
      >(Prisma.sql`
        WITH order_totals AS (
          SELECT o."id",
                 o."waiterId",
                 o."tableId",
                 SUM(oi."quantity" * oi."unitPrice") AS total
          FROM "Order" o
          INNER JOIN "OrderItem" oi ON oi."orderId" = o."id"
          INNER JOIN "Bill" b ON b."id" = o."billId"
          INNER JOIN "Table" t ON t."id" = b."tableId"
          WHERE t."restaurantId" = ${user.restaurantId}
            AND b."paidAt" >= ${from}
            AND b."paidAt" <= ${to}
            AND oi."status" != 'CANCELLED'
          GROUP BY o."id", o."waiterId", o."tableId"
        )
        SELECT u."name" AS "waiterName",
               COUNT(ot."id")::bigint AS orders,
               COALESCE(SUM(ot.total), 0) AS "totalSales",
               COALESCE(AVG(ot.total), 0) AS "averageTicket",
               COUNT(DISTINCT ot."tableId")::bigint AS "tablesServed"
        FROM order_totals ot
        INNER JOIN "User" u ON u."id" = ot."waiterId"
        GROUP BY u."name"
        ORDER BY "totalSales" DESC, orders DESC
      `),
      prisma.$queryRaw<Array<{ dayOfWeek: number; hour: number; total: Prisma.Decimal }>>(Prisma.sql`
        SELECT (EXTRACT(ISODOW FROM b."paidAt")::int - 1) AS "dayOfWeek",
               EXTRACT(HOUR FROM b."paidAt")::int AS hour,
               SUM(b."total") AS total
        FROM "Bill" b
        INNER JOIN "Table" t ON t."id" = b."tableId"
        WHERE t."restaurantId" = ${user.restaurantId}
          AND b."paidAt" >= ${from}
          AND b."paidAt" <= ${to}
          AND EXTRACT(HOUR FROM b."paidAt") BETWEEN 10 AND 23
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC
      `),
      prisma.$queryRaw<
        Array<{ paymentMethod: "CASH" | "CARD" | "MIXED"; total: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT b."paymentMethod" AS "paymentMethod",
               SUM(b."total") AS total
        FROM "Bill" b
        INNER JOIN "Table" t ON t."id" = b."tableId"
        WHERE t."restaurantId" = ${user.restaurantId}
          AND b."paidAt" >= ${from}
          AND b."paidAt" <= ${to}
        GROUP BY b."paymentMethod"
      `)
    ]);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      granularity
    },
    salesOverTime: salesOverTimeRows.map((row) => ({
      date: row.bucket.toISOString(),
      label: formatTimeBucket(new Date(row.bucket), granularity),
      total: roundAmount(row.total.toNumber())
    })),
    salesByCategory: salesByCategoryRows.map((row) => ({
      categoryName: row.categoryName,
      total: roundAmount(row.total.toNumber()),
      quantity: Number(row.quantity)
    })),
    topProducts: topProductsRows.map((row) => ({
      productName: row.productName,
      categoryName: row.categoryName,
      total: roundAmount(row.total.toNumber()),
      quantity: Number(row.quantity)
    })),
    waiterPerformance: waiterRows.map((row) => ({
      waiterName: row.waiterName,
      orders: Number(row.orders),
      totalSales: roundAmount(row.totalSales.toNumber()),
      averageTicket: roundAmount(row.averageTicket.toNumber()),
      tablesServed: Number(row.tablesServed)
    })),
    hourlyHeatmap: heatmapRows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      hour: row.hour,
      total: roundAmount(row.total.toNumber())
    })),
    paymentMethods: paymentRows.reduce(
      (acc, row) => {
        const value = roundAmount(row.total.toNumber());
        if (row.paymentMethod === "CASH") acc.cash = value;
        if (row.paymentMethod === "CARD") acc.card = value;
        if (row.paymentMethod === "MIXED") acc.mixed = value;
        return acc;
      },
      { cash: 0, card: 0, mixed: 0 }
    )
  };
}
