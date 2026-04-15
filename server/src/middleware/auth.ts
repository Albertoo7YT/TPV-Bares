import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../services/auth.service.js";
import type { AppRole } from "../types/auth.js";

export function authMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({
      status: 401,
      message: "Unauthorized"
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  try {
    request.user = verifyAuthToken(token);
    next();
  } catch {
    response.status(401).json({
      status: 401,
      message: "Unauthorized"
    });
  }
}

export function roleMiddleware(roles: AppRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) {
      response.status(401).json({
        status: 401,
        message: "Unauthorized"
      });
      return;
    }

    if (!roles.includes(request.user.role)) {
      response.status(403).json({
        status: 403,
        message: "Forbidden"
      });
      return;
    }

    next();
  };
}
