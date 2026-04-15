import { Router } from "express";
import { createHttpError } from "../lib/errors.js";
import { roleMiddleware } from "../middleware/auth.js";
import {
  createIngredient,
  deleteIngredient,
  listIngredients,
  updateIngredient
} from "../services/ingredient.service.js";

const router = Router();

function getRouteId(id: string | string[] | undefined) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, "Invalid resource id");
  }

  return id.trim();
}

router.get("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await listIngredients(request.user!.restaurantId));
  } catch (error) {
    next(error);
  }
});

router.post("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.status(201).json(await createIngredient(request.user!.restaurantId, request.body));
  } catch (error) {
    next(error);
  }
});

router.put("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(
      await updateIngredient(request.user!.restaurantId, getRouteId(request.params.id), request.body)
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await deleteIngredient(request.user!.restaurantId, getRouteId(request.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
