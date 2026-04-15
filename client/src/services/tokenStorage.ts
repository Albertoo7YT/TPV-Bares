const TOKEN_KEY = "tpv.token";
const USER_KEY = "tpv.user";
const DEVICE_TOKEN_KEY = "tpv.deviceToken";
const DEVICE_RESTAURANT_NAME_KEY = "tpv.deviceRestaurantName";

export type StoredUser = {
  id: string;
  name: string;
  role: "ADMIN" | "WAITER" | "KITCHEN";
  restaurantId: string;
};

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}

export function clearAuthStorage() {
  clearStoredToken();
  clearStoredUser();
}

export function getStoredDeviceToken() {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setStoredDeviceToken(deviceToken: string) {
  localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
}

export function clearStoredDeviceToken() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}

export function getStoredDeviceRestaurantName() {
  return localStorage.getItem(DEVICE_RESTAURANT_NAME_KEY);
}

export function setStoredDeviceRestaurantName(name: string) {
  localStorage.setItem(DEVICE_RESTAURANT_NAME_KEY, name);
}

export function clearStoredDeviceRestaurantName() {
  localStorage.removeItem(DEVICE_RESTAURANT_NAME_KEY);
}

export function clearDeviceStorage() {
  clearStoredDeviceToken();
  clearStoredDeviceRestaurantName();
}
