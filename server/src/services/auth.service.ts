import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";
import type { AppRole, AuthenticatedUser } from "../types/auth.js";

type LoginResult = {
  token: string;
  user: {
    id: string;
    name: string;
    role: AppRole;
  };
};

type DeviceLoginResult = {
  deviceToken: string;
  restaurantId: string;
  restaurantName: string;
};

type DeviceRecord = {
  id: string;
  restaurantId: string;
  deviceToken: string;
  deviceName: string;
  userAgent: string;
  lastUsed: Date;
  active: boolean;
  createdAt: Date;
  restaurant?: {
    id: string;
    name: string;
  };
};

const MAX_FAILED_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const pinFailures = new Map<string, number[]>();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

function createAuthToken(user: {
  id: string;
  role: AppRole;
  restaurantId: string;
}) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      restaurantId: user.restaurantId
    } satisfies AuthenticatedUser,
    getJwtSecret(),
    {
      expiresIn: "12h"
    }
  );
}

function getDeviceModel() {
  return prisma as unknown as typeof prisma & {
    authorizedDevice: {
      create: (args: unknown) => Promise<unknown>;
      findFirst: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown[]>;
      update: (args: unknown) => Promise<unknown>;
      delete: (args: unknown) => Promise<unknown>;
    };
  };
}

function normalizeFailures(deviceToken: string) {
  const now = Date.now();
  const activeFailures = (pinFailures.get(deviceToken) ?? []).filter(
    (timestamp) => now - timestamp < PIN_WINDOW_MS
  );
  pinFailures.set(deviceToken, activeFailures);
  return activeFailures;
}

function registerPinFailure(deviceToken: string) {
  const failures = normalizeFailures(deviceToken);
  failures.push(Date.now());
  pinFailures.set(deviceToken, failures);
}

function clearPinFailures(deviceToken: string) {
  pinFailures.delete(deviceToken);
}

export async function deviceLogin(input: {
  email: string;
  password: string;
  deviceName?: string;
  userAgent?: string;
}): Promise<DeviceLoginResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!email || !password) {
    throw createHttpError(400, "Email y contraseña son obligatorios");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: {
      email
    },
    select: {
      id: true,
      name: true,
      passwordHash: true
    }
  });

  if (!restaurant || !(await verifyPassword(password, restaurant.passwordHash))) {
    throw createHttpError(401, "Credenciales incorrectas");
  }

  const deviceToken = randomUUID();
  const userAgent = input.userAgent?.trim() || "Unknown";
  const deviceName = input.deviceName?.trim() || "Dispositivo sin nombre";

  await getDeviceModel().authorizedDevice.create({
    data: {
      restaurantId: restaurant.id,
      deviceToken,
      deviceName,
      userAgent,
      lastUsed: new Date(),
      active: true
    }
  });

  return {
    deviceToken,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name
  };
}

export async function verifyDevice(deviceToken: string | null | undefined) {
  if (!deviceToken) {
    return { valid: false as const };
  }

  const device = (await getDeviceModel().authorizedDevice.findFirst({
    where: {
      deviceToken,
      active: true
    },
    include: {
      restaurant: {
        select: {
          name: true
        }
      }
    }
  })) as DeviceRecord | null;

  if (!device) {
    return { valid: false as const };
  }

  return {
    valid: true as const,
    restaurantId: device.restaurantId,
    restaurantName: device.restaurant?.name ?? ""
  };
}

export async function loginWithPin(pin: string, deviceToken: string): Promise<LoginResult> {
  const normalizedPin = pin.trim();
  const failures = normalizeFailures(deviceToken);

  if (failures.length >= MAX_FAILED_ATTEMPTS) {
    throw createHttpError(429, "Demasiados intentos. Espere 15 minutos.");
  }

  const device = (await getDeviceModel().authorizedDevice.findFirst({
    where: {
      deviceToken,
      active: true
    }
  })) as DeviceRecord | null;

  if (!device) {
    throw createHttpError(401, "Dispositivo no autorizado");
  }

  const user = await prisma.user.findFirst({
    where: {
      pin: normalizedPin,
      active: true,
      restaurantId: device.restaurantId
    },
    select: {
      id: true,
      name: true,
      role: true,
      restaurantId: true
    }
  });

  if (!user) {
    registerPinFailure(deviceToken);
    throw createHttpError(401, "PIN incorrecto");
  }

  clearPinFailures(deviceToken);

  await getDeviceModel().authorizedDevice.update({
    where: {
      id: device.id
    },
    data: {
      lastUsed: new Date()
    }
  });

  return {
    token: createAuthToken(user),
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  };
}

export async function listAuthorizedDevices(restaurantId: string) {
  return getDeviceModel().authorizedDevice.findMany({
    where: {
      restaurantId
    },
    orderBy: {
      lastUsed: "desc"
    }
  });
}

export async function revokeAuthorizedDevice(restaurantId: string, deviceId: string) {
  const device = (await getDeviceModel().authorizedDevice.findFirst({
    where: {
      id: deviceId,
      restaurantId
    }
  })) as DeviceRecord | null;

  if (!device) {
    throw createHttpError(404, "Dispositivo no encontrado");
  }

  return getDeviceModel().authorizedDevice.update({
    where: {
      id: deviceId
    },
    data: {
      active: false
    }
  });
}

export async function renameAuthorizedDevice(restaurantId: string, deviceId: string, deviceName: string) {
  const normalizedName = deviceName.trim();

  if (!normalizedName) {
    throw createHttpError(400, "deviceName is required");
  }

  const device = (await getDeviceModel().authorizedDevice.findFirst({
    where: {
      id: deviceId,
      restaurantId
    }
  })) as DeviceRecord | null;

  if (!device) {
    throw createHttpError(404, "Dispositivo no encontrado");
  }

  return getDeviceModel().authorizedDevice.update({
    where: {
      id: deviceId
    },
    data: {
      deviceName: normalizedName
    }
  });
}

export async function deleteAuthorizedDevice(restaurantId: string, deviceId: string) {
  const device = (await getDeviceModel().authorizedDevice.findFirst({
    where: {
      id: deviceId,
      restaurantId
    }
  })) as DeviceRecord | null;

  if (!device) {
    throw createHttpError(404, "Dispositivo no encontrado");
  }

  return getDeviceModel().authorizedDevice.delete({
    where: {
      id: deviceId
    }
  });
}

export function verifyAuthToken(token: string): AuthenticatedUser {
  const payload = jwt.verify(token, getJwtSecret());

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.userId !== "string" ||
    typeof payload.restaurantId !== "string" ||
    !["ADMIN", "WAITER", "KITCHEN"].includes(payload.role as string)
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: payload.userId,
    role: payload.role as AppRole,
    restaurantId: payload.restaurantId
  };
}
