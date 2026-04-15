import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import {
  exportRestaurantData,
  getSettings,
  regenerateRestaurantRelayToken,
  resetOperationalData,
  updateRestaurantCredentials,
  updateSettings
} from "../services/settings.service.js";

const router = Router();

router.use(roleMiddleware(["ADMIN"]));

router.get("/", async (request, response, next) => {
  try {
    const settings = await getSettings(request.user!);
    response.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put("/", async (request, response, next) => {
  try {
    const settings = await updateSettings(request.body, request.user!);
    response.json(settings);
  } catch (error) {
    next(error);
  }
});

router.post("/relay-token/regenerate", async (request, response, next) => {
  try {
    const settings = await regenerateRestaurantRelayToken(request.user!);
    response.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put("/credentials", async (request, response, next) => {
  try {
    response.json(await updateRestaurantCredentials(request.body, request.user!));
  } catch (error) {
    next(error);
  }
});

router.post("/reset", async (request, response, next) => {
  try {
    const result = await resetOperationalData(request.body, request.user!);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (request, response, next) => {
  try {
    const data = await exportRestaurantData(request.user!);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="restaurant-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    response.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;
