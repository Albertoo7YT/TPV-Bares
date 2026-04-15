export type AppRole = "ADMIN" | "WAITER" | "KITCHEN";

export type AuthenticatedUser = {
  userId: string;
  role: AppRole;
  restaurantId: string;
};
