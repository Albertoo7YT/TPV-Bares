import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { join } from "node:path";

import { readConfig, type PrinterConfig, type PrinterRole } from "./config";
import { generateTestTicket } from "./escpos";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);
const PRINTER_TIMEOUT_MS = 3000;

export type PrintResult = {
  success: boolean;
  error?: string;
};

function withTimeoutError(error: unknown) {
  if (error instanceof Error) {
    if ("killed" in error || /timed out/i.test(error.message)) {
      return "Timeout de impresion (3s)";
    }

    return error.message;
  }

  return String(error);
}

async function printToNetwork(printerConfig: PrinterConfig, data: Buffer): Promise<PrintResult> {
  if (!printerConfig.networkIp) {
    return { success: false, error: "networkIp no configurada" };
  }

  return new Promise<PrintResult>((resolve) => {
    const socket = net.createConnection({
      host: printerConfig.networkIp,
      port: printerConfig.networkPort
    });

    let settled = false;

    const finish = (result: PrintResult) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PRINTER_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(data, (error) => {
        if (error) {
          finish({ success: false, error: error.message });
          return;
        }

        socket.end();
      });
    });

    socket.on("timeout", () => {
      finish({ success: false, error: "Timeout de impresion por red (3s)" });
    });

    socket.on("error", (error) => {
      finish({ success: false, error: error.message });
    });

    socket.on("close", () => {
      finish({ success: true });
    });
  });
}

function normalizeUsbTarget(usbPort: string) {
  if (usbPort.startsWith("\\\\")) {
    return usbPort;
  }

  if (usbPort.startsWith("\\.\\")) {
    return usbPort;
  }

  return `\\\\.\\${usbPort}`;
}

async function printToUsb(printerConfig: PrinterConfig, data: Buffer): Promise<PrintResult> {
  if (!printerConfig.usbPort) {
    return { success: false, error: "usbPort no configurado" };
  }

  const tempDir = await mkdtemp(join(os.tmpdir(), "tpv-relay-"));
  const filePath = join(tempDir, "ticket.bin");
  const target = normalizeUsbTarget(printerConfig.usbPort);

  try {
    await writeFile(filePath, data);

    await execFileAsync(
      "cmd.exe",
      ["/c", `copy /b "${filePath}" "${target}"`],
      {
        timeout: PRINTER_TIMEOUT_MS,
        windowsHide: true
      }
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: withTimeoutError(error)
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function printToDevice(
  printerConfig: PrinterConfig,
  data: Buffer
): Promise<PrintResult> {
  if (!printerConfig.enabled) {
    return { success: false, error: "Impresora deshabilitada" };
  }

  logger.info("Enviando bytes raw a impresora.", {
    type: printerConfig.type,
    bytes: data.length
  });

  if (printerConfig.type === "network") {
    return printToNetwork(printerConfig, data);
  }

  return printToUsb(printerConfig, data);
}

export async function listAvailablePrinters(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-Printer | Select-Object Name, PortName | ForEach-Object { \"$($_.Name)|$($_.PortName)\" }"
      ],
      {
        timeout: PRINTER_TIMEOUT_MS,
        windowsHide: true
      }
    );

    const printers = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (printers.length > 0) {
      return printers;
    }
  } catch (error) {
    logger.warn("No se pudo obtener el listado de impresoras con Get-Printer.", {
      error: withTimeoutError(error)
    });
  }

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Printer | ForEach-Object { \"$($_.Name)|$($_.PortName)\" }"
      ],
      {
        timeout: PRINTER_TIMEOUT_MS,
        windowsHide: true
      }
    );

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    logger.warn("No se pudo obtener el listado de impresoras con Win32_Printer.", {
      error: withTimeoutError(error)
    });
    return [];
  }
}

export async function listAvailableUsbPorts(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty PortName"
      ],
      {
        timeout: PRINTER_TIMEOUT_MS,
        windowsHide: true
      }
    );

    const ports = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^USB\d+/i.test(line) || line.startsWith("\\\\"));

    return Array.from(new Set(ports));
  } catch (error) {
    logger.warn("No se pudieron listar puertos USB de impresora.", {
      error: withTimeoutError(error)
    });
    return [];
  }
}

export async function testPrinter(printerType: PrinterRole): Promise<boolean> {
  const result = await testPrinterDetailed(printerType);
  return result.success;
}

export async function testPrinterDetailed(printerType: PrinterRole): Promise<PrintResult> {
  const config = readConfig();
  const printerConfig = config.printers[printerType];
  const result = await printToDevice(printerConfig, generateTestTicket(`Mesa ${printerType}`));

  if (!result.success) {
    logger.error("Fallo en test de impresion.", {
      printerType,
      error: result.error
    });
  }

  return result;
}

export async function listSpoolFiles(tempDir: string): Promise<string[]> {
  try {
    return await readdir(tempDir);
  } catch {
    return [];
  }
}
