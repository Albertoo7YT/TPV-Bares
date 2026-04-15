import type { Server as SocketIOServer } from "socket.io";
import type { AppRole } from "../types/auth.js";

let ioInstance: SocketIOServer | null = null;

function getRestaurantRoom(restaurantId: string) {
  return `restaurant:${restaurantId}`;
}

function getRoleRoom(role: AppRole, restaurantId: string) {
  if (role === "WAITER") {
    return `waiters:${restaurantId}`;
  }

  return getRestaurantRoom(restaurantId);
}

export function setSocketServer(io: SocketIOServer) {
  ioInstance = io;
}

export function emitToRestaurant(event: string, restaurantId: string, payload: unknown) {
  ioInstance?.to(getRestaurantRoom(restaurantId)).emit(event, payload);
}

export function emitToWaiters(event: string, restaurantId: string, payload: unknown) {
  ioInstance?.to(getRoleRoom("WAITER", restaurantId)).emit(event, payload);
}

export function getSocketRooms(role: AppRole, restaurantId: string) {
  return {
    restaurantRoom: getRestaurantRoom(restaurantId),
    roleRoom: getRoleRoom(role, restaurantId)
  };
}
