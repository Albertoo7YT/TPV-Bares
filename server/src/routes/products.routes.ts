import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import {
  createProduct,
  getProductIngredients,
  listAllProducts,
  listAvailableProductsGrouped,
  listFrequentProducts,
  replaceProductIngredients,
  softDeleteProduct,
  toggleProductAvailability,
  updateProduct
} from "../services/product.service.js";
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
    const products = await listAvailableProductsGrouped(request.user!.restaurantId);
    response.json(products);
  } catch (error) {
    next(error);
  }
});

router.get("/all", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const products = await listAllProducts(request.user!.restaurantId);
    response.json(products);
  } catch (error) {
    next(error);
  }
});

router.get("/frequent", async (request, response, next) => {
  try {
    const products = await listFrequentProducts(request.user!.restaurantId, request.query.limit);
    response.json(products);
  } catch (error) {
    next(error);
  }
});

router.post("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const product = await createProduct(request.user!.restaurantId, request.body);
    response.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const product = await updateProduct(
      request.user!.restaurantId,
      getRouteId(request.params.id),
      request.body
    );
    response.json(product);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/toggle",
  roleMiddleware(["ADMIN"]),
  async (request, response, next) => {
    try {
      const product = await toggleProductAvailability(
        request.user!.restaurantId,
        getRouteId(request.params.id)
      );
      response.json(product);
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const product = await softDeleteProduct(
      request.user!.restaurantId,
      getRouteId(request.params.id)
    );
    response.json(product);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/ingredients", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await getProductIngredients(request.user!.restaurantId, getRouteId(request.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put("/:id/ingredients", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(
      await replaceProductIngredients(
        request.user!.restaurantId,
        getRouteId(request.params.id),
        request.body
      )
    );
  } catch (error) {
    next(error);
  }
});

export default router;
