import { Router } from "express";
import authRouter from "./auth.routes.js";
import billsRouter from "./bills.routes.js";
import cashRegisterRouter from "./cash-register.routes.js";
import categoriesRouter from "./categories.routes.js";
import devicesRouter from "./devices.routes.js";
import ingredientsRouter from "./ingredients.routes.js";
import ordersRouter from "./orders.routes.js";
import productsRouter from "./products.routes.js";
import relayRouter from "./relay.routes.js";
import settingsRouter from "./settings.routes.js";
import statsRouter from "./stats.routes.js";
import tablesRouter from "./tables.routes.js";
import uploadRouter from "./upload.routes.js";
import usersRouter from "./users.routes.js";
import { getHealthStatus } from "../services/health.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.get("/health", (_request, response) => {
  response.json(getHealthStatus());
});

router.use("/auth", authRouter);
router.use("/bills", authMiddleware, billsRouter);
router.use("/cash-register", authMiddleware, cashRegisterRouter);
router.use("/categories", authMiddleware, categoriesRouter);
router.use("/devices", authMiddleware, devicesRouter);
router.use("/ingredients", authMiddleware, ingredientsRouter);
router.use("/orders", authMiddleware, ordersRouter);
router.use("/products", authMiddleware, productsRouter);
router.use("/relay", authMiddleware, relayRouter);
router.use("/settings", authMiddleware, settingsRouter);
router.use("/stats", authMiddleware, statsRouter);
router.use("/tables", authMiddleware, tablesRouter);
router.use("/upload", authMiddleware, uploadRouter);
router.use("/users", authMiddleware, usersRouter);

export default router;
