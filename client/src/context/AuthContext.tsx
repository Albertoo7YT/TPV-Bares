import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { api, setUnauthorizedHandler } from "../services/api";
import {
  clearAuthStorage,
  clearDeviceStorage,
  getStoredDeviceRestaurantName,
  getStoredDeviceToken,
  getStoredToken,
  getStoredUser,
  setStoredDeviceRestaurantName,
  setStoredDeviceToken,
  setStoredToken,
  setStoredUser,
  type StoredUser
} from "../services/tokenStorage";
import { buildUserFromToken, isTokenValid, parseJwtPayload } from "../utils/auth";

type DeviceVerificationResponse =
  | { valid: true; restaurantName: string; restaurantId: string }
  | { valid: false };

type DeviceLoginResponse = {
  deviceToken: string;
  restaurantId: string;
  restaurantName: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    role: StoredUser["role"];
  };
};

type AuthContextValue = {
  user: StoredUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  deviceAuthorized: boolean;
  restaurantName: string | null;
  authorizeDevice: (input: { email: string; password: string; deviceName?: string }) => Promise<void>;
  login: (pin: string) => Promise<void>;
  logout: () => void;
  clearDeviceAuthorization: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);

  const clearDeviceAuthorization = () => {
    clearDeviceStorage();
    clearAuthStorage();
    setDeviceAuthorized(false);
    setRestaurantName(null);
    setToken(null);
    setUser(null);
  };

  const logout = () => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const storedDeviceToken = getStoredDeviceToken();
      const storedRestaurantName = getStoredDeviceRestaurantName();

      if (!storedDeviceToken) {
        if (!cancelled) {
          setDeviceAuthorized(false);
          setRestaurantName(null);
          setIsReady(true);
        }
        return;
      }

      try {
        const device = await api.get<DeviceVerificationResponse>("/auth/verify-device");

        if (!device.valid) {
          clearDeviceAuthorization();
          if (!cancelled) {
            setIsReady(true);
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setDeviceAuthorized(true);
        setRestaurantName(device.restaurantName || storedRestaurantName || null);
        setStoredDeviceRestaurantName(device.restaurantName || storedRestaurantName || "");

        const storedToken = getStoredToken();
        const storedUser = getStoredUser();

        if (!storedToken || !isTokenValid(storedToken)) {
          clearAuthStorage();
          setToken(null);
          setUser(null);
          setIsReady(true);
          return;
        }

        const restoredUser = buildUserFromToken(storedToken, storedUser);

        if (!restoredUser) {
          clearAuthStorage();
          setToken(null);
          setUser(null);
          setIsReady(true);
          return;
        }

        setToken(storedToken);
        setUser(restoredUser);
      } catch {
        clearDeviceAuthorization();
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const authorizeDevice = async (input: { email: string; password: string; deviceName?: string }) => {
    const response = await api.post<DeviceLoginResponse>("/auth/device-login", input);
    setStoredDeviceToken(response.deviceToken);
    setStoredDeviceRestaurantName(response.restaurantName);
    setDeviceAuthorized(true);
    setRestaurantName(response.restaurantName);
  };

  const login = async (pin: string) => {
    const normalizedPin = pin.trim();

    if (!/^\d{4}$/.test(normalizedPin)) {
      throw new Error("Introduce un PIN de 4 digitos");
    }

    if (!getStoredDeviceToken()) {
      throw new Error("Dispositivo no autorizado");
    }

    const response = await api.post<LoginResponse>("/auth/pin-login", {
      pin: normalizedPin
    });
    const payload = parseJwtPayload(response.token);

    if (!payload?.restaurantId) {
      throw new Error("Token invalido recibido del servidor");
    }

    const nextUser: StoredUser = {
      id: response.user.id,
      name: response.user.name,
      role: response.user.role,
      restaurantId: payload.restaurantId
    };

    setStoredToken(response.token);
    setStoredUser(nextUser);
    setToken(response.token);
    setUser(nextUser);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isReady,
      deviceAuthorized,
      restaurantName,
      authorizeDevice,
      login,
      logout,
      clearDeviceAuthorization
    }),
    [token, user, isReady, deviceAuthorized, restaurantName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
