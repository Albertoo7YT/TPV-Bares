import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getRuntimeBaseDir } from "./paths";

export type PrinterType = "usb" | "network";
export type PrinterRole = "kitchen" | "receipt";

export interface PrinterConfig {
  enabled: boolean;
  type: PrinterType;
  usbPort: string;
  networkIp: string;
  networkPort: number;
}

export interface RelayConfig {
  serverUrl: string;
  authToken: string;
  restaurantId: string;
  printers: Record<PrinterRole, PrinterConfig>;
  autoReconnect: boolean;
  reconnectInterval: number;
}

const CONFIG_PATH = resolve(getRuntimeBaseDir(), "config.json");

export const defaultConfig: RelayConfig = {
  serverUrl: "",
  authToken: "",
  restaurantId: "",
  printers: {
    kitchen: {
      enabled: false,
      type: "usb",
      usbPort: "",
      networkIp: "",
      networkPort: 9100
    },
    receipt: {
      enabled: false,
      type: "usb",
      usbPort: "",
      networkIp: "",
      networkPort: 9100
    }
  },
  autoReconnect: true,
  reconnectInterval: 5000
};

function ensureConfigFile(): void {
  if (existsSync(CONFIG_PATH)) {
    return;
  }

  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
}

export function getConfigPath(): string {
  ensureConfigFile();
  return CONFIG_PATH;
}

export function readConfig(): RelayConfig {
  ensureConfigFile();
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<RelayConfig>;

  return {
    ...defaultConfig,
    ...parsed,
    printers: {
      kitchen: {
        ...defaultConfig.printers.kitchen,
        ...parsed.printers?.kitchen
      },
      receipt: {
        ...defaultConfig.printers.receipt,
        ...parsed.printers?.receipt
      }
    }
  };
}

export function writeConfig(nextConfig: RelayConfig): RelayConfig {
  ensureConfigFile();
  writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), "utf8");
  return nextConfig;
}

export function updateConfig(partial: Partial<RelayConfig>): RelayConfig {
  const current = readConfig();
  const merged: RelayConfig = {
    ...current,
    ...partial,
    printers: {
      kitchen: {
        ...current.printers.kitchen,
        ...partial.printers?.kitchen
      },
      receipt: {
        ...current.printers.receipt,
        ...partial.printers?.receipt
      }
    }
  };

  return writeConfig(merged);
}
