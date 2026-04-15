import type { NextFunction, Request, Response } from "express";
import type { AppError } from "../lib/errors.js";

export function errorHandler(
  error: AppError,
  _request: Request,
  response: Response,
  _next: NextFunction
) {
  const status = error.status ?? 500;
  const message = error.message || "Internal server error";

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    status,
    message
  });
}
