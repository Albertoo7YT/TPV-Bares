import { Router } from "express";
import {
  deviceLogin,
  loginWithPin,
  verifyDevice
} from "../services/auth.service.js";

const router = Router();

router.post("/device-login", async (request, response, next) => {
  try {
    const { email, password, deviceName } = request.body as {
      email?: string;
      password?: string;
      deviceName?: string;
    };

    if (typeof email !== "string" || typeof password !== "string") {
      response.status(400).json({
        status: 400,
        message: "Email y contraseña son obligatorios"
      });
      return;
    }

    response.json(
      await deviceLogin({
        email,
        password,
        deviceName,
        userAgent: request.headers["user-agent"]
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/verify-device", async (request, response, next) => {
  try {
    const deviceTokenHeader = request.headers["x-device-token"];
    const deviceToken =
      typeof deviceTokenHeader === "string" ? deviceTokenHeader.trim() : "";

    response.json(await verifyDevice(deviceToken));
  } catch (error) {
    next(error);
  }
});

router.post("/pin-login", async (request, response, next) => {
  try {
    const { pin } = request.body as { pin?: string };
    const deviceTokenHeader = request.headers["x-device-token"];
    const deviceToken =
      typeof deviceTokenHeader === "string" ? deviceTokenHeader.trim() : "";

    if (typeof pin !== "string" || !/^\d{4}$/.test(pin.trim())) {
      response.status(400).json({
        status: 400,
        message: "PIN must be a 4-digit string"
      });
      return;
    }

    if (!deviceToken) {
      response.status(401).json({
        status: 401,
        message: "Dispositivo no autorizado"
      });
      return;
    }

    response.json(await loginWithPin(pin, deviceToken));
  } catch (error) {
    next(error);
  }
});

export default router;
