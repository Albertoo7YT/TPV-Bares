import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { ensureRelayToken, regenerateRelayToken } from "./relay.service.js";

type SettingsInput = {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  logoUrl?: unknown;
  ticketMessage?: unknown;
  taxRate?: unknown;
  taxIncluded?: unknown;
  currency?: unknown;
  currencySymbol?: unknown;
  openingTime?: unknown;
  closingTime?: unknown;
  kitchenAlertMinutes?: unknown;
  allowTakeaway?: unknown;
  notificationSounds?: unknown;
  autoPrintKitchen?: unknown;
  autoPrintReceipt?: unknown;
  printModifications?: unknown;
  kitchenCopies?: unknown;
  ticketWidth?: unknown;
};

type ResetInput = {
  confirmation?: unknown;
};

type CredentialsInput = {
  currentPassword?: unknown;
  email?: unknown;
  newPassword?: unknown;
};

type RestaurantSettingsRecord = {
  id: string;
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  ticketMessage?: string | null;
  taxRate?: { toNumber(): number };
  taxIncluded?: boolean;
  currency?: string;
  currencySymbol?: string;
  openingTime?: string;
  closingTime?: string;
  kitchenAlertMinutes?: number;
  allowTakeaway?: boolean;
  notificationSounds?: boolean;
  relayToken?: string | null;
  autoPrintKitchen?: boolean;
  autoPrintReceipt?: boolean;
  printModifications?: boolean;
  kitchenCopies?: number;
  ticketWidth?: number;
  email?: string;
  passwordHash?: string;
  createdAt: Date;
};

function decimalToNumber(value: { toNumber(): number }) {
  return Number(value.toNumber().toFixed(2));
}

function normalizeRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${fieldName} must be a string`);
  }

  return value.trim() || null;
}

function normalizeBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw createHttpError(400, `${fieldName} must be a boolean`);
  }

  return value;
}

function normalizeOptionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeBoolean(value, fieldName);
}

function normalizePositiveNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw createHttpError(400, `${fieldName} must be a valid number`);
  }

  return Number(value.toFixed(2));
}

function normalizeOptionalInteger(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw createHttpError(400, `${fieldName} must be an integer greater than 0`);
  }

  return value;
}

function normalizeTime(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value.trim())) {
    throw createHttpError(400, `${fieldName} must use HH:mm format`);
  }

  return value.trim();
}

function normalizeOptionalTime(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeTime(value, fieldName);
}

function normalizeLogoUrl(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "logoUrl must be a string");
  }

  const normalized = value.trim();

  if (!normalized.startsWith("/uploads/restaurant/logo.")) {
    throw createHttpError(400, "logoUrl must point to /uploads/restaurant/logo.*");
  }

  return normalized;
}

function mapRestaurantSettings(
  restaurantInput: RestaurantSettingsRecord
) {
  const restaurant = restaurantInput;

  return {
    id: restaurant.id,
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    logoUrl: restaurant.logoUrl,
    ticketMessage: restaurant.ticketMessage ?? null,
    taxRate: restaurant.taxRate ? decimalToNumber(restaurant.taxRate) : 10,
    taxIncluded: restaurant.taxIncluded ?? true,
    currency: restaurant.currency ?? "EUR",
    currencySymbol: restaurant.currencySymbol ?? "€",
    openingTime: restaurant.openingTime ?? "10:00",
    closingTime: restaurant.closingTime ?? "23:00",
    kitchenAlertMinutes: restaurant.kitchenAlertMinutes ?? 10,
    allowTakeaway: restaurant.allowTakeaway ?? false,
    notificationSounds: restaurant.notificationSounds ?? true,
    relayToken: restaurant.relayToken ?? null,
    autoPrintKitchen: restaurant.autoPrintKitchen ?? true,
    autoPrintReceipt: restaurant.autoPrintReceipt ?? true,
    printModifications: restaurant.printModifications ?? true,
    kitchenCopies: restaurant.kitchenCopies ?? 1,
    ticketWidth: restaurant.ticketWidth ?? 80
  };
}

export async function updateRestaurantCredentials(input: CredentialsInput, user: AuthenticatedUser) {
  const currentPassword = normalizeRequiredString(input.currentPassword, "currentPassword");
  const nextEmail = normalizeRequiredString(input.email, "email").toLowerCase();
  const newPassword = normalizeRequiredString(input.newPassword, "newPassword");

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: user.restaurantId
    },
    select: {
      id: true,
      passwordHash: true
    }
  });

  const validCurrentPassword = await verifyPassword(currentPassword, restaurant.passwordHash);

  if (!validCurrentPassword) {
    throw createHttpError(401, "Contraseña actual incorrecta");
  }

  await prisma.restaurant.update({
    where: {
      id: user.restaurantId
    },
    data: {
      email: nextEmail,
      passwordHash: await hashPassword(newPassword)
    }
  });

  return {
    ok: true
  };
}

export async function getSettings(user: AuthenticatedUser) {
  await ensureRelayToken(user.restaurantId);

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: user.restaurantId
    }
  });

  return mapRestaurantSettings(restaurant as unknown as RestaurantSettingsRecord);
}

export async function updateSettings(input: SettingsInput, user: AuthenticatedUser) {
  const data: {
    name?: string;
    address?: string;
    phone?: string;
    logoUrl?: string | null;
    ticketMessage?: string | null;
    taxRate?: number;
    taxIncluded?: boolean;
    currency?: string;
    currencySymbol?: string;
    openingTime?: string;
    closingTime?: string;
    kitchenAlertMinutes?: number;
    allowTakeaway?: boolean;
    notificationSounds?: boolean;
    autoPrintKitchen?: boolean;
    autoPrintReceipt?: boolean;
    printModifications?: boolean;
    kitchenCopies?: number;
    ticketWidth?: number;
  } = {};

  if (input.name !== undefined) data.name = normalizeRequiredString(input.name, "name");
  if (input.address !== undefined) data.address = normalizeRequiredString(input.address, "address");
  if (input.phone !== undefined) data.phone = normalizeRequiredString(input.phone, "phone");
  if (input.logoUrl !== undefined) data.logoUrl = normalizeLogoUrl(input.logoUrl);
  if (input.ticketMessage !== undefined) {
    data.ticketMessage = normalizeOptionalString(input.ticketMessage, "ticketMessage");
  }
  if (input.taxRate !== undefined) data.taxRate = normalizePositiveNumber(input.taxRate, "taxRate");
  if (input.taxIncluded !== undefined) {
    data.taxIncluded = normalizeBoolean(input.taxIncluded, "taxIncluded");
  }
  if (input.currency !== undefined) {
    data.currency = normalizeRequiredString(input.currency, "currency").toUpperCase();
  }
  if (input.currencySymbol !== undefined) {
    data.currencySymbol = normalizeRequiredString(input.currencySymbol, "currencySymbol");
  }
  if (input.openingTime !== undefined) {
    data.openingTime = normalizeOptionalTime(input.openingTime, "openingTime");
  }
  if (input.closingTime !== undefined) {
    data.closingTime = normalizeOptionalTime(input.closingTime, "closingTime");
  }
  if (input.kitchenAlertMinutes !== undefined) {
    data.kitchenAlertMinutes = normalizeOptionalInteger(
      input.kitchenAlertMinutes,
      "kitchenAlertMinutes"
    );
  }
  if (input.allowTakeaway !== undefined) {
    data.allowTakeaway = normalizeOptionalBoolean(input.allowTakeaway, "allowTakeaway");
  }
  if (input.notificationSounds !== undefined) {
    data.notificationSounds = normalizeOptionalBoolean(
      input.notificationSounds,
      "notificationSounds"
    );
  }
  if (input.autoPrintKitchen !== undefined) {
    data.autoPrintKitchen = normalizeOptionalBoolean(input.autoPrintKitchen, "autoPrintKitchen");
  }
  if (input.autoPrintReceipt !== undefined) {
    data.autoPrintReceipt = normalizeOptionalBoolean(input.autoPrintReceipt, "autoPrintReceipt");
  }
  if (input.printModifications !== undefined) {
    data.printModifications = normalizeOptionalBoolean(
      input.printModifications,
      "printModifications"
    );
  }
  if (input.kitchenCopies !== undefined) {
    data.kitchenCopies = normalizeOptionalInteger(input.kitchenCopies, "kitchenCopies");

    if (data.kitchenCopies && ![1, 2].includes(data.kitchenCopies)) {
      throw createHttpError(400, "kitchenCopies must be 1 or 2");
    }
  }
  if (input.ticketWidth !== undefined) {
    data.ticketWidth = normalizeOptionalInteger(input.ticketWidth, "ticketWidth");

    if (data.ticketWidth && ![58, 80].includes(data.ticketWidth)) {
      throw createHttpError(400, "ticketWidth must be 58 or 80");
    }
  }

  const restaurant = await prisma.restaurant.update({
    where: {
      id: user.restaurantId
    },
    data
  });

  if (!(restaurant as { relayToken?: string | null }).relayToken) {
    await ensureRelayToken(user.restaurantId);
  }

  const restaurantWithRelay = await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: user.restaurantId
    }
  });

  return mapRestaurantSettings(restaurantWithRelay as unknown as RestaurantSettingsRecord);
}

export async function regenerateRestaurantRelayToken(user: AuthenticatedUser) {
  const relayToken = await regenerateRelayToken(user.restaurantId);

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: {
      id: user.restaurantId
    }
  });

  return {
    ...mapRestaurantSettings(restaurant as unknown as RestaurantSettingsRecord),
    relayToken
  };
}

export async function resetOperationalData(input: ResetInput, user: AuthenticatedUser) {
  const confirmation = normalizeRequiredString(input.confirmation, "confirmation");

  if (confirmation !== "RESETEAR") {
    throw createHttpError(400, 'confirmation must be "RESETEAR"');
  }

  const tableIds = await prisma.table.findMany({
    where: {
      restaurantId: user.restaurantId
    },
    select: {
      id: true
    }
  });

  const tableIdList = tableIds.map((table) => table.id);

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({
      where: {
        order: {
          table: {
            restaurantId: user.restaurantId
          }
        }
      }
    });

    await tx.order.deleteMany({
      where: {
        table: {
          restaurantId: user.restaurantId
        }
      }
    });

    await tx.bill.deleteMany({
      where: {
        table: {
          restaurantId: user.restaurantId
        }
      }
    });

    await tx.cashRegister.deleteMany({
      where: {
        restaurantId: user.restaurantId
      }
    });

    if (tableIdList.length > 0) {
      await tx.table.updateMany({
        where: {
          id: {
            in: tableIdList
          }
        },
        data: {
          status: "FREE"
        }
      });
    }
  });

  return {
    ok: true
  };
}

export async function exportRestaurantData(user: AuthenticatedUser) {
  const restaurant = await prisma.restaurant.findUnique({
    where: {
      id: user.restaurantId
    },
    include: {
      users: {
        orderBy: {
          createdAt: "asc"
        }
      },
      categories: {
        orderBy: {
          order: "asc"
        }
      },
      products: {
        orderBy: {
          createdAt: "asc"
        }
      },
      tables: {
        orderBy: {
          number: "asc"
        }
      },
      cashRegisters: {
        orderBy: {
          openedAt: "desc"
        }
      }
    }
  });

  if (!restaurant) {
    throw createHttpError(404, "Restaurant not found");
  }

  const bills = await prisma.bill.findMany({
    where: {
      table: {
        restaurantId: user.restaurantId
      }
    },
    orderBy: {
      paidAt: "desc"
    },
    include: {
      table: true,
      orders: {
        include: {
          items: {
            include: {
              product: true
            }
          },
          waiter: true
        }
      }
    }
  });

  return {
    exportedAt: new Date().toISOString(),
    restaurant: {
      ...mapRestaurantSettings(restaurant),
      createdAt: restaurant.createdAt.toISOString()
    },
    users: restaurant.users,
    categories: restaurant.categories,
    products: restaurant.products,
    tables: restaurant.tables,
    bills: bills.map((bill) => ({
      ...bill,
      subtotal: decimalToNumber(bill.subtotal),
      tax: decimalToNumber(bill.tax),
      total: decimalToNumber(bill.total),
      cashAmount: bill.cashAmount ? decimalToNumber(bill.cashAmount) : null,
      cardAmount: bill.cardAmount ? decimalToNumber(bill.cardAmount) : null
    })),
    cashRegisters: restaurant.cashRegisters.map((register) => ({
      ...register,
      initialCash: decimalToNumber(register.initialCash),
      totalCash: decimalToNumber(register.totalCash),
      totalCard: decimalToNumber(register.totalCard),
      totalSales: decimalToNumber(register.totalSales),
      realCash: register.realCash ? decimalToNumber(register.realCash) : null,
      difference: register.difference ? decimalToNumber(register.difference) : null
    }))
  };
}
