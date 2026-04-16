import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import { createHttpError } from "../lib/errors.js";
import {
  createTablesBulk,
  createTable,
  deleteTable,
  listTablesWithStatus,
  updateTable,
  updateTableZoneOrder,
  updateTableStatus
} from "../services/tableService.js";

const router = Router();

function getRouteId(id: string | string[] | undefined) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, "Invalid resource id");
  }

  return id;
}

router.get("/", async (request, response, next) => {
  try {
    const tables = await listTablesWithStatus(request.user!.restaurantId);
    response.json(tables);
  } catch (error) {
    next(error);
  }
});

router.post("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const table = await createTable(request.user!.restaurantId, request.body);
    response.status(201).json(table);
  } catch (error) {
    next(error);
  }
});

router.post("/bulk", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const tables = await createTablesBulk(request.user!.restaurantId, request.body);
    response.status(201).json(tables);
  } catch (error) {
    next(error);
  }
});

router.patch("/zones/order", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const tables = await updateTableZoneOrder(request.user!.restaurantId, request.body ?? {});
    response.json(tables);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const table = await updateTable(
      request.user!.restaurantId,
      getRouteId(request.params.id),
      request.body
    );
    response.json(table);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (request, response, next) => {
  try {
    const table = await updateTableStatus(
      request.user!.restaurantId,
      getRouteId(request.params.id),
      request.body?.status
    );
    response.json(table);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const result = await deleteTable(request.user!.restaurantId, getRouteId(request.params.id));
    response.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
