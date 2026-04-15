import { Router } from "express";
import { roleMiddleware } from "../middleware/auth.js";
import { createHttpError } from "../lib/errors.js";
import {
  createUser,
  deleteUser,
  listUsers,
  toggleUserActive,
  updateUser
} from "../services/user.service.js";

const router = Router();

function getRouteId(id: string | string[] | undefined) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createHttpError(400, "Invalid user id");
  }

  return id.trim();
}

router.use(roleMiddleware(["ADMIN"]));

router.get("/", async (request, response, next) => {
  try {
    const users = await listUsers(request.user!);
    response.json(users);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const user = await createUser(request.body, request.user!);
    response.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (request, response, next) => {
  try {
    const user = await updateUser(getRouteId(request.params.id), request.body, request.user!);
    response.json(user);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/toggle", async (request, response, next) => {
  try {
    const user = await toggleUserActive(getRouteId(request.params.id), request.user!);
    response.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (request, response, next) => {
  try {
    const result = await deleteUser(getRouteId(request.params.id), request.user!);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
