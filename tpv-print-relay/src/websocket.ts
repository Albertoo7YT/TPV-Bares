import { EventEmitter } from "node:events";
import os from "node:os";
import { io, type Socket } from "socket.io-client";
import { readConfig, type PrinterRole, type RelayConfig } from "./config";
import { logger } from "./logger";
import { printToDevice, testPrinter } from "./printer";

type PrinterState = "ok" | "error" | "disabled";

type RelayStatus = {
  connected: boolean;
  lastConnected: Date | null;
  lastError: string | null;
  printerKitchen: PrinterState;
  printerReceipt: PrinterState;
  uptimeMs: number;
  startedAt: string;
  serverUrl: string;
  lastPrintKitchen: Date | null;
  lastPrintReceipt: Date | null;
};

type KitchenPrintPayload = {
  orderId: string;
  dataBase64: string;
};

type ReceiptPrintPayload = {
  billId: string;
  dataBase64: string;
};

type TestPrintPayload = {
  printer: PrinterRole;
  dataBase64?: string;
};

type PrintAck =
  | { orderId: string; status: "printed" }
  | { orderId: string; status: "error"; message: string }
  | { billId: string; status: "printed" }
  | { billId: string; status: "error"; message: string }
  | { printer: PrinterRole; status: "printed" }
  | { printer: PrinterRole; status: "error"; message: string };

const relayEvents = new EventEmitter();
const relayStartedAt = new Date().toISOString();

let relayStatus: RelayStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  printerKitchen: readConfig().printers.kitchen.enabled ? "ok" : "disabled",
  printerReceipt: readConfig().printers.receipt.enabled ? "ok" : "disabled",
  uptimeMs: 0,
  startedAt: relayStartedAt,
  serverUrl: readConfig().serverUrl,
  lastPrintKitchen: null,
  lastPrintReceipt: null
};

function emitStatusUpdate() {
  relayStatus = {
    ...relayStatus,
    uptimeMs: Date.now() - new Date(relayStartedAt).getTime()
  };
  relayEvents.emit("status", getStatus());
  activeClient?.publishStatus();
}

let activeClient: RelayWebSocketClient | null = null;

function setPrinterStatus(printer: PrinterRole, state: PrinterState) {
  if (printer === "kitchen") {
    relayStatus = {
      ...relayStatus,
      printerKitchen: state
    };
  } else {
    relayStatus = {
      ...relayStatus,
      printerReceipt: state
    };
  }

  emitStatusUpdate();
}

function syncPrinterStatesFromConfig(config: RelayConfig) {
  relayStatus = {
    ...relayStatus,
    serverUrl: config.serverUrl
  };
  setPrinterStatus("kitchen", config.printers.kitchen.enabled ? relayStatus.printerKitchen : "disabled");
  setPrinterStatus("receipt", config.printers.receipt.enabled ? relayStatus.printerReceipt : "disabled");
}

function decodeBase64(dataBase64: string) {
  return Buffer.from(dataBase64, "base64");
}

async function runPrint(printer: PrinterRole, data: Buffer): Promise<void> {
  const config = readConfig();
  const printerConfig = config.printers[printer];

  syncPrinterStatesFromConfig(config);

  const result = await printToDevice(printerConfig, data);

  if (!result.success) {
    throw new Error(result.error || "Error de impresion desconocido");
  }

  setPrinterStatus(printer, printerConfig.enabled ? "ok" : "disabled");
  relayStatus = {
    ...relayStatus,
    ...(printer === "kitchen"
      ? { lastPrintKitchen: new Date() }
      : { lastPrintReceipt: new Date() })
  };
  emitStatusUpdate();
}

export function getStatus(): RelayStatus {
  return { ...relayStatus };
}

export { relayEvents };

export class RelayWebSocketClient {
  private socket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  public connect(config: RelayConfig = readConfig()): void {
    activeClient = this;
    syncPrinterStatesFromConfig(config);

    if (!config.serverUrl || !config.authToken || !config.restaurantId) {
      relayStatus = {
        ...relayStatus,
        connected: false,
        serverUrl: config.serverUrl,
        lastError: "Config incompleta: serverUrl, authToken y restaurantId son obligatorios."
      };
      emitStatusUpdate();
      logger.warn("No se inicia WebSocket: falta configuracion obligatoria.");
      return;
    }

    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(config.serverUrl, {
      auth: {
        type: "print-relay",
        authToken: config.authToken,
        restaurantId: config.restaurantId,
        deviceName: os.hostname(),
        localIp: getLocalIpAddress(),
        startedAt: relayStartedAt
      },
      reconnection: false,
      transports: ["websocket"]
    });

    this.socket.on("connect", () => {
      const wasDisconnected = !relayStatus.connected;
      this.reconnectAttempts = 0;
      relayStatus = {
        ...relayStatus,
        connected: true,
        lastConnected: new Date(),
        lastError: null,
        serverUrl: config.serverUrl
      };
      emitStatusUpdate();
      if (wasDisconnected) {
        relayEvents.emit("connection-restored");
      }
      this.publishStatus();
      logger.info("Conectado al VPS por WebSocket.", {
        socketId: this.socket?.id
      });
    });

    this.socket.on("disconnect", (reason) => {
      const wasConnected = relayStatus.connected;
      relayStatus = {
        ...relayStatus,
        connected: false
      };
      emitStatusUpdate();
      if (wasConnected) {
        relayEvents.emit("connection-lost", { reason });
      }
      logger.warn("WebSocket desconectado.", { reason });
      this.scheduleReconnect();
    });

    this.socket.on("connect_error", (error) => {
      relayStatus = {
        ...relayStatus,
        connected: false,
        lastError: error.message
      };
      emitStatusUpdate();
      logger.error("Fallo de conexion WebSocket.", { message: error.message });
      this.scheduleReconnect();
    });

    this.socket.on("print:kitchen", async (payload: KitchenPrintPayload, ack?: (response: PrintAck) => void) => {
      const response = await this.handlePrintKitchen(payload);
      ack?.(response);
    });

    this.socket.on("print:receipt", async (payload: ReceiptPrintPayload, ack?: (response: PrintAck) => void) => {
      const response = await this.handlePrintReceipt(payload);
      ack?.(response);
    });

    this.socket.on(
      "print:test",
      async (
        payload: TestPrintPayload,
        ack?: (response: { printer: PrinterRole; status: "printed" | "error"; message?: string }) => void
      ) => {
        const response = await this.handlePrintTest(payload);
        ack?.(response);
      }
    );

    this.socket.on("ping", (ack?: (response: "pong") => void) => {
      ack?.("pong");
    });
  }

  public disconnect(): void {
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    if (activeClient === this) {
      activeClient = null;
    }
    relayStatus = {
      ...relayStatus,
      connected: false
    };
    emitStatusUpdate();
  }

  public reconnect(config: RelayConfig = readConfig()): void {
    logger.info("Reiniciando conexion WebSocket manualmente.");
    this.connect(config);
  }

  public refreshConfigState(config: RelayConfig = readConfig()): void {
    syncPrinterStatesFromConfig(config);
    emitStatusUpdate();
  }

  public publishStatus(): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit("relay:status", {
      ...getStatus(),
      deviceName: os.hostname(),
      deviceIp: getLocalIpAddress(),
      startedAt: relayStartedAt
    });
  }

  private scheduleReconnect(): void {
    const config = readConfig();

    if (!config.autoReconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const baseDelay = Math.max(config.reconnectInterval, 5000);
    const delay = Math.min(baseDelay * 2 ** (this.reconnectAttempts - 1), 60000);

    logger.info("Programando reconexion WebSocket.", {
      attempt: this.reconnectAttempts,
      delayMs: delay
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info("Intentando reconectar WebSocket.", {
        attempt: this.reconnectAttempts
      });
      this.connect(readConfig());
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async handlePrintKitchen(payload: KitchenPrintPayload): Promise<PrintAck> {
    try {
      await runPrint("kitchen", decodeBase64(payload.dataBase64));
      relayEvents.emit("print-result", {
        printer: "kitchen",
        id: payload.orderId,
        status: "printed"
      });
      return { orderId: payload.orderId, status: "printed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPrinterStatus("kitchen", "error");
      relayStatus = {
        ...relayStatus,
        lastError: message
      };
      emitStatusUpdate();
      relayEvents.emit("printer-error", {
        printer: "kitchen",
        message
      });
      relayEvents.emit("print-result", {
        printer: "kitchen",
        id: payload.orderId,
        status: "error",
        message
      });
      return { orderId: payload.orderId, status: "error", message };
    }
  }

  private async handlePrintReceipt(payload: ReceiptPrintPayload): Promise<PrintAck> {
    try {
      await runPrint("receipt", decodeBase64(payload.dataBase64));
      relayEvents.emit("print-result", {
        printer: "receipt",
        id: payload.billId,
        status: "printed"
      });
      return { billId: payload.billId, status: "printed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPrinterStatus("receipt", "error");
      relayStatus = {
        ...relayStatus,
        lastError: message
      };
      emitStatusUpdate();
      relayEvents.emit("printer-error", {
        printer: "receipt",
        message
      });
      relayEvents.emit("print-result", {
        printer: "receipt",
        id: payload.billId,
        status: "error",
        message
      });
      return { billId: payload.billId, status: "error", message };
    }
  }

  private async handlePrintTest(payload: TestPrintPayload) {
    try {
      if ("dataBase64" in payload && typeof payload.dataBase64 === "string") {
        await runPrint(payload.printer, decodeBase64(payload.dataBase64));
      } else {
        const ok = await testPrinter(payload.printer);

        if (!ok) {
          throw new Error("No se pudo imprimir el ticket de prueba");
        }
      }

      relayEvents.emit("print-result", {
        printer: payload.printer,
        status: "printed"
      });
      return { printer: payload.printer, status: "printed" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPrinterStatus(payload.printer, "error");
      relayStatus = {
        ...relayStatus,
        lastError: message
      };
      emitStatusUpdate();
      relayEvents.emit("printer-error", {
        printer: payload.printer,
        message
      });
      return { printer: payload.printer, status: "error" as const, message };
    }
  }
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}
