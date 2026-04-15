import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRuntimeBaseDir } from "./paths";

const logDir = resolve(getRuntimeBaseDir(), "logs");
const logFile = resolve(logDir, "relay.log");

function write(level: string, message: string, meta?: unknown): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  const line = `[${timestamp}] [${level}] ${message}${suffix}`;

  appendFileSync(logFile, `${line}\n`, "utf8");

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info: (message: string, meta?: unknown) => write("INFO", message, meta),
  warn: (message: string, meta?: unknown) => write("WARN", message, meta),
  error: (message: string, meta?: unknown) => write("ERROR", message, meta),
  debug: (message: string, meta?: unknown) => write("DEBUG", message, meta)
};

export function getLogFilePath(): string {
  return logFile;
}

export function readLogTail(lines = 50): string[] {
  if (!existsSync(logFile)) {
    return [];
  }

  const content = readFileSync(logFile, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-Math.max(1, lines));
}
