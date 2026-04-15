import { clearAuthStorage, getStoredDeviceToken, getStoredToken } from "./tokenStorage";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  body?: unknown;
  headers?: HeadersInit;
};

let unauthorizedHandler: (() => void) | null = null;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}) {
  const token = getStoredToken();
  const deviceToken = getStoredDeviceToken();
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (deviceToken) {
    headers.set("X-Device-Token", deviceToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthStorage();
      unauthorizedHandler?.();
    }

    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String(payload.message)
        : response.statusText || "Request failed";

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export const api = {
  get<T>(path: string) {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown) {
    return request<T>("POST", path, { body });
  },
  put<T>(path: string, body?: unknown) {
    return request<T>("PUT", path, { body });
  },
  patch<T>(path: string, body?: unknown) {
    return request<T>("PATCH", path, { body });
  },
  delete<T>(path: string) {
    return request<T>("DELETE", path);
  }
};
