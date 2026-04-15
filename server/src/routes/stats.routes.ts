import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import { getDashboardStats, getTpvQuickStats } from "../services/dashboard.service.js";
import { getReportsStats } from "../services/reports.service.js";

const router = Router();

router.get("/dashboard", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const stats = await getDashboardStats(request.user!);
    response.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/tpv", roleMiddleware(["ADMIN", "WAITER"]), async (request, response, next) => {
  try {
    const stats = await getTpvQuickStats(request.user!);
    response.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/reports", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const stats = await getReportsStats(request.query, request.user!);
    response.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
