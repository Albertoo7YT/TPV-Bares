import { Router } from "express";
import multer from "multer";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { roleMiddleware } from "../middleware/auth.js";
import { createHttpError } from "../lib/errors.js";

const router = Router();
const PRODUCTS_UPLOADS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../uploads/products"
);
const RESTAURANT_UPLOADS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../uploads/restaurant"
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(createHttpError(400, "Only JPG, PNG and WebP files are allowed"));
      return;
    }

    callback(null, true);
  }
});

router.post(
  "/image",
  roleMiddleware(["ADMIN"]),
  upload.single("image"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        throw createHttpError(400, "Image file is required");
      }

      const productIdRaw = typeof request.body?.productId === "string" ? request.body.productId : "";
      const productId = productIdRaw.trim() || "product";
      const extensionByMimeType: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
      };
      const extension =
        extensionByMimeType[request.file.mimetype] || extname(request.file.originalname) || ".jpg";
      const filename = `${productId}_${Date.now()}${extension}`;

      await mkdir(PRODUCTS_UPLOADS_DIR, { recursive: true });
      await writeFile(resolve(PRODUCTS_UPLOADS_DIR, filename), request.file.buffer);

      response.status(201).json({
        url: `/uploads/products/${filename}`
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/restaurant-logo",
  roleMiddleware(["ADMIN"]),
  upload.single("image"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        throw createHttpError(400, "Image file is required");
      }

      const extensionByMimeType: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
      };
      const extension =
        extensionByMimeType[request.file.mimetype] || extname(request.file.originalname) || ".jpg";

      await mkdir(RESTAURANT_UPLOADS_DIR, { recursive: true });

      const existingFiles = await readdir(RESTAURANT_UPLOADS_DIR).catch(() => []);

      await Promise.all(
        existingFiles
          .filter((filename) => filename.startsWith("logo."))
          .map((filename) => rm(resolve(RESTAURANT_UPLOADS_DIR, filename), { force: true }))
      );

      const filename = `logo${extension}`;
      await writeFile(resolve(RESTAURANT_UPLOADS_DIR, filename), request.file.buffer);

      response.status(201).json({
        url: `/uploads/restaurant/${filename}`
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
