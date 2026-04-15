import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import {
  createCategory,
  listActiveCategories,
  listAllCategories,
  reorderCategory,
  reorderCategories,
  softDeleteCategory,
  updateCategory
} from "../services/category.service.js";
import { createHttpError } from "../lib/errors.js";

const router = Router();

function getRouteId(id: string | string[] | undefined) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, "Invalid resource id");
  }

  return id;
}

router.get("/", async (request, response, next) => {
  try {
    const categories = await listActiveCategories(request.user!.restaurantId);
    response.json(categories);
  } catch (error) {
    next(error);
  }
});

router.get("/all", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const categories = await listAllCategories(request.user!.restaurantId);
    response.json(categories);
  } catch (error) {
    next(error);
  }
});

router.post("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const category = await createCategory(request.user!.restaurantId, request.body);
    response.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

router.patch("/reorder", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const categories = await reorderCategories(request.user!.restaurantId, request.body ?? {});
    response.json(categories);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const category = await updateCategory(
      request.user!.restaurantId,
      getRouteId(request.params.id),
      request.body
    );
    response.json(category);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/reorder",
  roleMiddleware(["ADMIN"]),
  async (request, response, next) => {
    try {
      const categories = await reorderCategory(
        request.user!.restaurantId,
        getRouteId(request.params.id),
        request.body?.order
      );
      response.json(categories);
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const category = await softDeleteCategory(
      request.user!.restaurantId,
      getRouteId(request.params.id)
    );
    response.json(category);
  } catch (error) {
    next(error);
  }
});

export default router;
