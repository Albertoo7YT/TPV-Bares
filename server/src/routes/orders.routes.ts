import { Router } from "express";
import { createHttpError } from "../lib/errors.js";
import {
  addItemsToOrder,
  cancelOrder,
  createOrder,
  deleteOrderItem,
  getActiveOrdersForTable,
  getOrderById,
  listOrders,
  updateOrderItem
} from "../services/orderService.js";

const router = Router();

function getRouteId(id: string | string[] | undefined, fieldName = "id") {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, `Invalid ${fieldName}`);
  }

  return id.trim();
}

router.post("/", async (request, response, next) => {
  try {
    const order = await createOrder(request.body, request.user!);
    response.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response, next) => {
  try {
    const orders = await listOrders(
      {
        statuses: request.query.status,
        today: request.query.today
      },
      request.user!
    );
    response.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/table/:tableId", async (request, response, next) => {
  try {
    const orders = await getActiveOrdersForTable(
      getRouteId(request.params.tableId, "tableId"),
      request.user!
    );
    response.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (request, response, next) => {
  try {
    const order = await getOrderById(getRouteId(request.params.id), request.user!);
    response.json(order);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (request, response, next) => {
  try {
    const order = await cancelOrder(getRouteId(request.params.id), request.user!);
    response.json(order);
  } catch (error) {
    next(error);
  }
});

router.patch("/:orderId/items/:itemId", async (request, response, next) => {
  try {
    const order = await updateOrderItem(
      getRouteId(request.params.orderId, "orderId"),
      getRouteId(request.params.itemId, "itemId"),
      request.body ?? {},
      request.user!
    );
    response.json(order);
  } catch (error) {
    next(error);
  }
});

router.delete("/:orderId/items/:itemId", async (request, response, next) => {
  try {
    const order = await deleteOrderItem(
      getRouteId(request.params.orderId, "orderId"),
      getRouteId(request.params.itemId, "itemId"),
      request.user!
    );
    response.json(order);
  } catch (error) {
    next(error);
  }
});

router.post("/:orderId/items", async (request, response, next) => {
  try {
    const order = await addItemsToOrder(
      getRouteId(request.params.orderId, "orderId"),
      request.body?.items,
      request.user!
    );
    response.json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
