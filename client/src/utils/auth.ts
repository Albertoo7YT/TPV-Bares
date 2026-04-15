import type { StoredUser } from "../services/tokenStorage";

type JwtPayload = {
  exp?: number;
  userId?: string;
  role?: StoredUser["role"];
  restaurantId?: string;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function parseJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");

  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenValid(token: string) {
  const payload = parseJwtPayload(token);

  if (!payload?.exp || !payload.userId || !payload.role || !payload.restaurantId) {
    return false;
  }

  return payload.exp * 1000 > Date.now();
}

export function buildUserFromToken(
  token: string,
  storedUser: Omit<StoredUser, "restaurantId"> | StoredUser | null
): StoredUser | null {
  const payload = parseJwtPayload(token);

  if (!payload?.userId || !payload.role || !payload.restaurantId) {
    return null;
  }

  return {
    id: storedUser?.id ?? payload.userId,
    name: storedUser?.name ?? "Usuario",
    role: payload.role,
    restaurantId: payload.restaurantId
  };
}
