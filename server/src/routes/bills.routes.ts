import { Router } from "express";
import { createHttpError } from "../lib/errors.js";
import { roleMiddleware } from "../middleware/auth.js";
import {
  createBill,
  getBillById,
  getBillPreview,
  listBills
} from "../services/billService.js";

const router = Router();

function getRouteId(id: string | string[] | undefined, fieldName: string) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, `Invalid ${fieldName}`);
  }

  return id.trim();
}

router.get("/table/:tableId/preview", async (request, response, next) => {
  try {
    const preview = await getBillPreview(
      getRouteId(request.params.tableId, "tableId"),
      request.user!
    );
    response.json(preview);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const bill = await createBill(request.body, request.user!);
    response.status(201).json(bill);
  } catch (error) {
    next(error);
  }
});

router.get("/", roleMiddleware(["ADMIN", "WAITER"]), async (request, response, next) => {
  try {
    const bills = await listBills(request.query, request.user!);
    response.json(bills);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", roleMiddleware(["ADMIN", "WAITER"]), async (request, response, next) => {
  try {
    const bill = await getBillById(getRouteId(request.params.id, "billId"), request.user!);
    response.json(bill);
  } catch (error) {
    next(error);
  }
});

export default router;
