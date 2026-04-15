import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import { createHttpError } from "../lib/errors.js";
import { getRelayStatus, sendRelayTest } from "../services/relay.service.js";

const router = Router();

router.use(roleMiddleware(["ADMIN"]));

router.get("/status", async (request, response, next) => {
  try {
    response.json(getRelayStatus(request.user!.restaurantId));
  } catch (error) {
    next(error);
  }
});

router.post("/test/kitchen", async (request, response, next) => {
  try {
    const result = await sendRelayTest(request.user!.restaurantId, "kitchen");
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/test/receipt", async (request, response, next) => {
  try {
    const result = await sendRelayTest(request.user!.restaurantId, "receipt");
    response.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
