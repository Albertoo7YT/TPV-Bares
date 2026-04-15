import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

type SocketContextValue = {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
};

const SocketContext = createContext<SocketContextValue | null>(null);
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace(/\/api$/, "") ?? "http://localhost:3001";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user || !token) {
      setSocket((currentSocket) => {
        currentSocket?.disconnect();
        return null;
      });
      setIsConnected(false);
      setIsReconnecting(false);
      return;
    }

    const nextSocket = io(SOCKET_URL, {
      auth: {
        token
      },
      reconnection: true
    });

    nextSocket.on("connect", () => {
      setIsConnected(true);
      setIsReconnecting(false);
      nextSocket.emit("join", {
        role: user.role,
        restaurantId: user.restaurantId
      });
    });

    nextSocket.on("disconnect", () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    nextSocket.io.on("reconnect_attempt", () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    nextSocket.on("connect_error", () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setIsReconnecting(false);
    };
  }, [isAuthenticated, token, user]);

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      isReconnecting
    }),
    [isConnected, isReconnecting, socket]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }

  return context;
}
