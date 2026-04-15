import { prisma } from "../lib/prisma.js";
import { createHttpError } from "../lib/errors.js";
import type { AppRole, AuthenticatedUser } from "../types/auth.js";

type UserInput = {
  name?: unknown;
  pin?: unknown;
  role?: unknown;
  active?: unknown;
};

function normalizeName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createHttpError(400, "User name is required");
  }

  return value.trim();
}

function normalizePin(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value.trim())) {
    throw createHttpError(400, "PIN must be a 4-digit string");
  }

  return value.trim();
}

function normalizeRole(value: unknown): AppRole {
  if (value !== "ADMIN" && value !== "WAITER" && value !== "KITCHEN") {
    throw createHttpError(400, "Invalid user role");
  }

  return value;
}

function normalizeActive(value: unknown) {
  if (typeof value !== "boolean") {
    throw createHttpError(400, "Active must be a boolean");
  }

  return value;
}

async function ensureUniquePin(
  restaurantId: string,
  pin: string,
  excludedUserId?: string
) {
  const existing = await prisma.user.findFirst({
    where: {
      restaurantId,
      pin,
      ...(excludedUserId
        ? {
            id: {
              not: excludedUserId
            }
          }
        : {})
    }
  });

  if (existing) {
    throw createHttpError(400, "PIN already exists");
  }
}

async function getUserOrThrow(restaurantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      restaurantId
    }
  });

  if (!user) {
    throw createHttpError(404, "User not found");
  }

  return user;
}

export async function listUsers(currentUser: AuthenticatedUser) {
  return prisma.user.findMany({
    where: {
      restaurantId: currentUser.restaurantId
    },
    orderBy: [
      {
        active: "desc"
      },
      {
        createdAt: "asc"
      }
    ],
    select: {
      id: true,
      name: true,
      pin: true,
      role: true,
      active: true,
      createdAt: true
    }
  });
}

export async function createUser(input: UserInput, currentUser: AuthenticatedUser) {
  const name = normalizeName(input.name);
  const pin = normalizePin(input.pin);
  const role = normalizeRole(input.role);

  await ensureUniquePin(currentUser.restaurantId, pin);

  return prisma.user.create({
    data: {
      name,
      pin,
      role,
      active: true,
      restaurantId: currentUser.restaurantId
    },
    select: {
      id: true,
      name: true,
      pin: true,
      role: true,
      active: true,
      createdAt: true
    }
  });
}

export async function updateUser(
  userId: string,
  input: UserInput,
  currentUser: AuthenticatedUser
) {
  await getUserOrThrow(currentUser.restaurantId, userId);

  const name = normalizeName(input.name);
  const pin = normalizePin(input.pin);
  const role = normalizeRole(input.role);
  const active = input.active === undefined ? undefined : normalizeActive(input.active);

  if (userId === currentUser.userId && active === false) {
    throw createHttpError(400, "You cannot deactivate your own user");
  }

  await ensureUniquePin(currentUser.restaurantId, pin, userId);

  return prisma.user.update({
    where: {
      id: userId
    },
    data: {
      name,
      pin,
      role,
      ...(active !== undefined ? { active } : {})
    },
    select: {
      id: true,
      name: true,
      pin: true,
      role: true,
      active: true,
      createdAt: true
    }
  });
}

export async function toggleUserActive(userId: string, currentUser: AuthenticatedUser) {
  if (userId === currentUser.userId) {
    throw createHttpError(400, "You cannot deactivate your own user");
  }

  const user = await getUserOrThrow(currentUser.restaurantId, userId);

  return prisma.user.update({
    where: {
      id: userId
    },
    data: {
      active: !user.active
    },
    select: {
      id: true,
      name: true,
      pin: true,
      role: true,
      active: true,
      createdAt: true
    }
  });
}

export async function deleteUser(userId: string, currentUser: AuthenticatedUser) {
  if (userId === currentUser.userId) {
    throw createHttpError(400, "You cannot delete your own user");
  }

  await getUserOrThrow(currentUser.restaurantId, userId);

  await prisma.user.delete({
    where: {
      id: userId
    }
  });

  return {
    ok: true
  };
}
