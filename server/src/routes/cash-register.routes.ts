import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import {
  closeCashRegister,
  getCashRegisterHistory,
  getCurrentCashRegister,
  openCashRegister
} from "../services/cashRegisterService.js";

const router = Router();

router.post("/open", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const cashRegister = await openCashRegister(request.body, request.user!);
    response.status(201).json(cashRegister);
  } catch (error) {
    next(error);
  }
});

router.get("/current", async (request, response, next) => {
  try {
    const cashRegister = await getCurrentCashRegister(request.user!);
    response.json(cashRegister);
  } catch (error) {
    next(error);
  }
});

router.post("/close", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const cashRegister = await closeCashRegister(request.body, request.user!);
    response.json(cashRegister);
  } catch (error) {
    next(error);
  }
});

router.get("/history", roleMiddleware(["ADMIN"]), async (request, response, next) => {
  try {
    const history = await getCashRegisterHistory(request.user!);
    response.json(history);
  } catch (error) {
    next(error);
  }
});

export default router;
