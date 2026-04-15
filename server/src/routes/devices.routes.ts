import { Router } from "express";
import { createHttpError } from "../lib/errors.js";
import { roleMiddleware } from "../middleware/auth.js";
import {
  deleteAuthorizedDevice,
  listAuthorizedDevices,
  renameAuthorizedDevice,
  revokeAuthorizedDevice
} from "../services/auth.service.js";

const router = Router();

function getRouteId(id: string | string[] | undefined) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, "Invalid resource id");
  }

  return id.trim();
}

router.get("/", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await listAuthorizedDevices(request.user!.restaurantId));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/revoke", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await revokeAuthorizedDevice(request.user!.restaurantId, getRouteId(request.params.id)));
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/rename", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const { deviceName } = request.body as { deviceName?: string };

    if (typeof deviceName !== "string") {
      throw createHttpError(400, "deviceName is required");
    }

    response.json(
      await renameAuthorizedDevice(
        request.user!.restaurantId,
        getRouteId(request.params.id),
        deviceName
      )
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    response.json(await deleteAuthorizedDevice(request.user!.restaurantId, getRouteId(request.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
