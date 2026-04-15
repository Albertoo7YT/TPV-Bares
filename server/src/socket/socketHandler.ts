import type { Server as SocketIOServer } from "socket.io";
import { getSocketRooms, setSocketServer } from "./socketEmitter.js";
import type { AppRole } from "../types/auth.js";
import {
  registerRelaySocket,
  updateRelayStatus,
  unregisterRelaySocket,
  validateRelayConnection
} from "../services/relay.service.js";

type JoinPayload = {
  role?: unknown;
  restaurantId?: unknown;
};

type RelayAuthPayload = {
  type?: unknown;
  authToken?: unknown;
  restaurantId?: unknown;
  deviceName?: unknown;
  startedAt?: unknown;
  localIp?: unknown;
};

function isAppRole(value: unknown): value is AppRole {
  return value === "ADMIN" || value === "WAITER" || value === "KITCHEN";
}

export function registerSocketHandlers(io: SocketIOServer) {
  setSocketServer(io);

  io.on("connection", async (socket) => {
    const relayAuth = socket.handshake.auth as RelayAuthPayload;

    if (relayAuth.type === "print-relay") {
      if (
        typeof relayAuth.restaurantId !== "string" ||
        typeof relayAuth.authToken !== "string" ||
        !(await validateRelayConnection(relayAuth.restaurantId, relayAuth.authToken))
      ) {
        socket.emit("error", {
          message: "Unauthorized relay"
        });
        socket.disconnect(true);
        return;
      }

      registerRelaySocket(relayAuth.restaurantId, socket, {
        deviceName: typeof relayAuth.deviceName === "string" ? relayAuth.deviceName : null,
        deviceIp:
          typeof relayAuth.localIp === "string"
            ? relayAuth.localIp
            : typeof socket.handshake.address === "string"
              ? socket.handshake.address
              : null,
        startedAt: typeof relayAuth.startedAt === "string" ? relayAuth.startedAt : null
      });
      socket.join(`relay:${relayAuth.restaurantId}`);
      socket.emit("relay:registered", {
        restaurantId: relayAuth.restaurantId
      });

      socket.on("relay:status", (status: Record<string, unknown>) => {
        updateRelayStatus(relayAuth.restaurantId as string, {
          lastError: typeof status.lastError === "string" ? status.lastError : null,
          printerKitchen:
            status.printerKitchen === "ok" ||
            status.printerKitchen === "error" ||
            status.printerKitchen === "disabled"
              ? status.printerKitchen
              : undefined,
          printerReceipt:
            status.printerReceipt === "ok" ||
            status.printerReceipt === "error" ||
            status.printerReceipt === "disabled"
              ? status.printerReceipt
              : undefined,
          deviceName: typeof status.deviceName === "string" ? status.deviceName : undefined,
          deviceIp: typeof status.deviceIp === "string" ? status.deviceIp : undefined,
          startedAt: typeof status.startedAt === "string" ? status.startedAt : undefined
        });
      });

      socket.on("disconnect", () => {
        unregisterRelaySocket(relayAuth.restaurantId as string, socket.id);
      });

      return;
    }

    socket.emit("server:ready", {
      message: "Socket.IO conectado"
    });

    socket.on("join", (payload: JoinPayload) => {
      if (!isAppRole(payload.role) || typeof payload.restaurantId !== "string") {
        socket.emit("error", {
          message: "Invalid join payload"
        });
        return;
      }

      const { restaurantRoom, roleRoom } = getSocketRooms(
        payload.role,
        payload.restaurantId
      );

      socket.join(restaurantRoom);
      socket.join(roleRoom);

      socket.emit("joined", {
        restaurantRoom,
        roleRoom
      });
    });
  });
}
