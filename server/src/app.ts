import cors from "cors";
import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp(clientUrl: string) {
  const app = express();
  const uploadsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");

  app.use(
    cors({
      origin: clientUrl
    })
  );
  app.use(express.json());
  app.use("/uploads", express.static(uploadsPath));

  app.use("/api", apiRouter);
  app.use(errorHandler);

  return app;
}
