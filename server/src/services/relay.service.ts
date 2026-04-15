import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import {
  generateKitchenTicket,
  generateReceiptTicket,
  generateTestTicket
} from "./escpos.service.js";

type PrinterTarget = "kitchen" | "receipt";

type RelaySocketRecord = {
  socket: Socket;
  connectedAt: Date;
  lastSeenAt: Date;
  deviceName: string | null;
  deviceIp: string | null;
  startedAt: string | null;
  lastError: string | null;
  printerKitchen: "ok" | "error" | "disabled";
  printerReceipt: "ok" | "error" | "disabled";
};

type RelayJobResult = {
  status: "printed" | "error";
  message?: string;
};

type KitchenOrderPayload = {
  id: string;
  createdAt: string | Date;
  notes?: string | null;
  table: {
    number: number;
    name?: string | null;
  };
  waiter?: {
    name: string;
  } | null;
  items: Array<{
    quantity: number;
    notes?: string | null;
    product: {
      name: string;
    };
    modifications?: Array<{
      action: "REMOVED" | "ADDED";
      ingredient: {
        name: string;
      };
    }>;
  }>;
};

type ReceiptBillPayload = {
  id: string;
  paidAt: string | Date;
  paymentMethod: string;
  total: { toNumber(): number } | number;
  subtotal: { toNumber(): number } | number;
  tax: { toNumber(): number } | number;
  cashAmount?: { toNumber(): number } | number | null;
  cardAmount?: { toNumber(): number } | number | null;
  table: {
    number: number;
    name?: string | null;
  };
  orders: Array<{
    waiter?: {
      name: string;
    } | null;
    items: Array<{
      quantity: number;
      unitPrice: { toNumber(): number } | number;
      product: {
        name: string;
      };
    }>;
  }>;
};

const relaySockets = new Map<string, RelaySocketRecord>();

function decimalToNumber(value: { toNumber(): number } | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }

  return Number(value.toNumber().toFixed(2));
}

function getRelaySocket(restaurantId: string) {
  return relaySockets.get(restaurantId) ?? null;
}

export async function ensureRelayToken(restaurantId: string) {
  const restaurant = (await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: restaurantId
    }
  })) as { relayToken?: string | null };

  if (restaurant.relayToken) {
    return restaurant.relayToken;
  }

  const relayToken = randomUUID();

  await (prisma.restaurant as unknown as {
    update: (args: {
      where: { id: string };
      data: { relayToken: string };
    }) => Promise<unknown>;
  }).update({
    where: {
      id: restaurantId
    },
    data: {
      relayToken
    }
  });

  return relayToken;
}

export async function validateRelayConnection(restaurantId: string, authToken: string) {
  const restaurant = (await (prisma.restaurant as unknown as {
    findUnique: (args: {
      where: { id: string };
      select: { relayToken: true };
    }) => Promise<{ relayToken?: string | null } | null>;
  }).findUnique({
    where: {
      id: restaurantId
    },
    select: {
      relayToken: true
    }
  })) as { relayToken?: string | null } | null;

  return Boolean(restaurant?.relayToken && restaurant.relayToken === authToken);
}

export async function regenerateRelayToken(restaurantId: string) {
  const relayToken = randomUUID();

  await (prisma.restaurant as unknown as {
    update: (args: {
      where: { id: string };
      data: { relayToken: string };
    }) => Promise<unknown>;
  }).update({
    where: {
      id: restaurantId
    },
    data: {
      relayToken
    }
  });

  const relay = relaySockets.get(restaurantId);
  relay?.socket.disconnect(true);
  relaySockets.delete(restaurantId);

  return relayToken;
}

export function registerRelaySocket(
  restaurantId: string,
  socket: Socket,
  metadata?: { deviceName?: string | null; deviceIp?: string | null; startedAt?: string | null }
) {
  relaySockets.set(restaurantId, {
    socket,
    connectedAt: new Date(),
    lastSeenAt: new Date(),
    deviceName: metadata?.deviceName ?? null,
    deviceIp: metadata?.deviceIp ?? null,
    startedAt: metadata?.startedAt ?? null,
    lastError: null,
    printerKitchen: "disabled",
    printerReceipt: "disabled"
  });
}

export function unregisterRelaySocket(restaurantId: string, socketId: string) {
  const current = relaySockets.get(restaurantId);

  if (current?.socket.id === socketId) {
    relaySockets.delete(restaurantId);
  }
}

export function getRelayStatus(restaurantId: string) {
  const relay = getRelaySocket(restaurantId);
  const uptimeMs =
    relay?.startedAt && !Number.isNaN(new Date(relay.startedAt).getTime())
      ? Date.now() - new Date(relay.startedAt).getTime()
      : relay
        ? Date.now() - relay.connectedAt.getTime()
        : null;

  return {
    connected: Boolean(relay),
    connectedAt: relay?.connectedAt ?? null,
    socketId: relay?.socket.id ?? null,
    deviceName: relay?.deviceName ?? null,
    deviceIp: relay?.deviceIp ?? null,
    uptimeMs,
    lastError: relay?.lastError ?? null,
    printers: {
      kitchen: relay?.printerKitchen ?? "disabled",
      receipt: relay?.printerReceipt ?? "disabled"
    }
  };
}

export function updateRelayStatus(
  restaurantId: string,
  status: {
    lastError?: string | null;
    printerKitchen?: "ok" | "error" | "disabled";
    printerReceipt?: "ok" | "error" | "disabled";
    deviceName?: string | null;
    deviceIp?: string | null;
    startedAt?: string | null;
  }
) {
  const relay = relaySockets.get(restaurantId);

  if (!relay) {
    return;
  }

  relay.lastSeenAt = new Date();
  relay.lastError = status.lastError ?? relay.lastError;
  relay.printerKitchen = status.printerKitchen ?? relay.printerKitchen;
  relay.printerReceipt = status.printerReceipt ?? relay.printerReceipt;
  relay.deviceName = status.deviceName ?? relay.deviceName;
  relay.deviceIp = status.deviceIp ?? relay.deviceIp;
  relay.startedAt = status.startedAt ?? relay.startedAt;
}

export async function emitToRelayWithAck<TPayload, TResponse>(
  restaurantId: string,
  event: string,
  payload: TPayload,
  timeoutMs = 15000
) {
  const relay = getRelaySocket(restaurantId);

  if (!relay) {
    throw createHttpError(503, "Print relay is not connected");
  }

  relay.lastSeenAt = new Date();

  return new Promise<TResponse>((resolve, reject) => {
    relay.socket.timeout(timeoutMs).emit(event, payload, (error: unknown, response: TResponse) => {
      if (error) {
        reject(createHttpError(504, `Relay timeout for event ${event}`));
        return;
      }

      resolve(response);
    });
  });
}

export async function sendKitchenPrintJob(restaurantId: string, order: KitchenOrderPayload) {
  const restaurant = await (prisma.restaurant as unknown as {
    findUniqueOrThrow: (args: {
      where: { id: string };
      select: { autoPrintKitchen: true; kitchenCopies: true };
    }) => Promise<{ autoPrintKitchen?: boolean; kitchenCopies?: number }>;
  }).findUniqueOrThrow({
    where: {
      id: restaurantId
    },
    select: {
      autoPrintKitchen: true,
      kitchenCopies: true
    }
  });

  if (!(restaurant as { autoPrintKitchen?: boolean }).autoPrintKitchen) {
    return {
      status: "printed" as const,
      message: "Auto print kitchen disabled"
    };
  }

  const copies = Math.max(1, Math.min(2, (restaurant as { kitchenCopies?: number }).kitchenCopies ?? 1));
  const ticket = generateKitchenTicket(order).toString("base64");

  return emitToRelayWithAck<
    { orderId: string; dataBase64: string; copies: number },
    RelayJobResult & { orderId?: string }
  >(restaurantId, "print:kitchen", {
    orderId: order.id,
    dataBase64: ticket,
    copies
  });
}

export async function sendReceiptPrintJob(restaurantId: string, bill: ReceiptBillPayload) {
  const restaurant = await (prisma.restaurant as unknown as {
    findUniqueOrThrow: (args: {
      where: { id: string };
      select: {
        name: true;
        address: true;
        phone: true;
        ticketMessage: true;
        autoPrintReceipt: true;
      };
    }) => Promise<{
      name: string;
      address: string;
      phone: string;
      ticketMessage: string | null;
      autoPrintReceipt?: boolean;
    }>;
  }).findUniqueOrThrow({
    where: {
      id: restaurantId
    },
    select: {
      name: true,
      address: true,
      phone: true,
      ticketMessage: true,
      autoPrintReceipt: true
    }
  });

  if (!(restaurant as { autoPrintReceipt?: boolean }).autoPrintReceipt) {
    return {
      status: "printed" as const,
      message: "Auto print receipt disabled"
    };
  }

  return emitToRelayWithAck<
    { billId: string; dataBase64: string },
    RelayJobResult & { billId?: string }
  >(restaurantId, "print:receipt", {
    billId: bill.id,
    dataBase64: generateReceiptTicket(
      {
        ...bill,
        table: {
          number: bill.table.number
        },
        waiter:
          bill.orders[0]?.waiter && "name" in bill.orders[0].waiter
            ? { name: bill.orders[0].waiter.name }
            : null
      },
      restaurant
    ).toString("base64")
  });
}

export async function sendRelayTest(restaurantId: string, printer: PrinterTarget) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: restaurantId
    },
    select: {
      name: true,
      address: true,
      phone: true,
      ticketMessage: true
    }
  });

  return emitToRelayWithAck<
    { printer: PrinterTarget; dataBase64: string },
    RelayJobResult & { printer?: PrinterTarget }
  >(
    restaurantId,
    "print:test",
    {
      printer,
      dataBase64: generateTestTicket(printer, restaurant).toString("base64")
    }
  );
}
