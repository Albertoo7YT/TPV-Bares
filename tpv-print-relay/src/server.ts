import express, { type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";

import { readConfig, updateConfig, type PrinterRole, type RelayConfig } from "./config";
import { readLogTail, logger } from "./logger";
import { getPanelDir, isPackaged } from "./paths";
import { listAvailablePrinters, listAvailableUsbPorts, testPrinterDetailed } from "./printer";
import { getStatus, type RelayWebSocketClient } from "./websocket";

export interface LocalServerHandle {
  app: express.Express;
  server: Server;
  port: number;
  close: () => Promise<void>;
}

type ServerContext = {
  websocketClient: RelayWebSocketClient;
};

const PANEL_DIR = getPanelDir();
const MASKED_TOKEN = "****";

function maskToken(token: string) {
  return token ? MASKED_TOKEN : "";
}

function toSafeConfig(config: RelayConfig) {
  return {
    ...config,
    authToken: maskToken(config.authToken)
  };
}

function hasConnectionConfigChanged(current: RelayConfig, next: RelayConfig) {
  return (
    current.serverUrl !== next.serverUrl ||
    current.authToken !== next.authToken ||
    current.restaurantId !== next.restaurantId ||
    current.autoReconnect !== next.autoReconnect ||
    current.reconnectInterval !== next.reconnectInterval
  );
}

function hasPrinterConfigChanged(current: RelayConfig, next: RelayConfig) {
  return JSON.stringify(current.printers) !== JSON.stringify(next.printers);
}

async function refreshPrinterDiscovery() {
  const [printers, ports] = await Promise.all([listAvailablePrinters(), listAvailableUsbPorts()]);

  const printerEntries = printers.map((entry) => {
    const [name, port] = entry.split("|");
    const cleanName = name?.trim() || entry;
    const cleanPort = port?.trim() || "";

    return {
      name: cleanName,
      port: cleanPort,
      kind: "printer" as const,
      label: cleanPort ? `${cleanName} (${cleanPort})` : cleanName,
      value: cleanName
    };
  });

  const knownPorts = new Set(
    printerEntries
      .map((entry) => entry.port)
      .filter(Boolean)
      .map((port) => port.toUpperCase())
  );

  const rawPortEntries = ports
    .filter((port) => !knownPorts.has(port.toUpperCase()))
    .map((port) => ({
      name: port,
      port,
      kind: "raw-port" as const,
      label: `Puerto raw ${port}`,
      value: port
    }));

  return {
    printers: [...printerEntries, ...rawPortEntries],
    ports
  };
}

function normalizeConfigPayload(payload: unknown, current: RelayConfig): Partial<RelayConfig> {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }

  const next = payload as Partial<RelayConfig>;
  const authToken =
    typeof next.authToken === "string" && next.authToken.trim() === MASKED_TOKEN
      ? current.authToken
      : typeof next.authToken === "string"
        ? next.authToken.trim()
        : current.authToken;

  const normalizePrinterConfig = (
    printer: Partial<RelayConfig["printers"][PrinterRole]> | undefined,
    currentPrinter: RelayConfig["printers"][PrinterRole]
  ) => {
    if (!printer) {
      return currentPrinter;
    }

    return {
      ...currentPrinter,
      ...printer,
      enabled:
        typeof printer.enabled === "boolean"
          ? printer.enabled
          : currentPrinter.enabled,
      type:
        printer.type === "usb" || printer.type === "network"
          ? printer.type
          : currentPrinter.type,
      usbPort:
        typeof printer.usbPort === "string"
          ? printer.usbPort.trim()
          : currentPrinter.usbPort,
      networkIp:
        typeof printer.networkIp === "string"
          ? printer.networkIp.trim()
          : currentPrinter.networkIp,
      networkPort:
        typeof printer.networkPort === "number" && Number.isFinite(printer.networkPort)
          ? printer.networkPort
          : currentPrinter.networkPort
    };
  };

  return {
    ...next,
    authToken,
    serverUrl:
      typeof next.serverUrl === "string" ? next.serverUrl.trim() : current.serverUrl,
    restaurantId:
      typeof next.restaurantId === "string" ? next.restaurantId.trim() : current.restaurantId,
    autoReconnect:
      typeof next.autoReconnect === "boolean"
        ? next.autoReconnect
        : current.autoReconnect,
    reconnectInterval:
      typeof next.reconnectInterval === "number" && Number.isFinite(next.reconnectInterval)
        ? next.reconnectInterval
        : current.reconnectInterval,
    printers: {
      kitchen: normalizePrinterConfig(next.printers?.kitchen, current.printers.kitchen),
      receipt: normalizePrinterConfig(next.printers?.receipt, current.printers.receipt)
    }
  };
}

export function startLocalServer(context: ServerContext, port = 9191): LocalServerHandle {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  logger.info("Panel web resuelto para runtime actual.", {
    packaged: isPackaged(),
    panelDir: PANEL_DIR
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    const config = readConfig();
    const status = getStatus();

    res.json({
      connected: status.connected,
      serverUrl: config.serverUrl,
      uptime: status.uptimeMs,
      startedAt: status.startedAt,
      lastConnected: status.lastConnected,
      lastError: status.lastError,
      lastPrintKitchen: status.lastPrintKitchen,
      lastPrintReceipt: status.lastPrintReceipt,
      printers: {
        kitchen: {
          enabled: config.printers.kitchen.enabled,
          type: config.printers.kitchen.type,
          status: status.printerKitchen
        },
        receipt: {
          enabled: config.printers.receipt.enabled,
          type: config.printers.receipt.type,
          status: status.printerReceipt
        }
      }
    });
  });

  app.get("/api/config", (_req: Request, res: Response) => {
    res.json(toSafeConfig(readConfig()));
  });

  app.put("/api/config", async (req: Request, res: Response) => {
    const currentConfig = readConfig();
    const partial = normalizeConfigPayload(req.body, currentConfig);
    const nextConfig = updateConfig(partial);
    const connectionChanged = hasConnectionConfigChanged(currentConfig, nextConfig);
    const printerChanged = hasPrinterConfigChanged(currentConfig, nextConfig);

    if (connectionChanged) {
      context.websocketClient.reconnect(nextConfig);
      logger.info("Configuracion de conexion actualizada desde el panel.");
    } else if (printerChanged) {
      context.websocketClient.refreshConfigState(nextConfig);
      logger.info("Configuracion de impresoras actualizada desde el panel.");
    }

    const printerDiscovery = printerChanged ? await refreshPrinterDiscovery() : null;

    res.json({
      success: true,
      config: toSafeConfig(nextConfig),
      printerDiscovery
    });
  });

  app.get("/api/printers", async (_req: Request, res: Response) => {
    res.json(await refreshPrinterDiscovery());
  });

  app.post("/api/test/:printer", async (req: Request, res: Response) => {
    const printer = req.params.printer as PrinterRole;

    if (printer !== "kitchen" && printer !== "receipt") {
      res.status(400).json({ success: false, error: "Impresora invalida" });
      return;
    }

    try {
      const result = await testPrinterDetailed(printer);

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || "No se pudo imprimir el ticket de prueba"
        });
        return;
      }

      context.websocketClient.publishStatus();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/logs", (_req: Request, res: Response) => {
    res.json({
      lines: readLogTail(50)
    });
  });

  app.use(express.static(PANEL_DIR));

  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(resolve(PANEL_DIR, "index.html"));
  });

  const server = createServer(app);
  server.listen(port, "127.0.0.1", () => {
    logger.info(`Panel local disponible en http://127.0.0.1:${port}`);
  });

  return {
    app,
    server,
    port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      })
  };
}
