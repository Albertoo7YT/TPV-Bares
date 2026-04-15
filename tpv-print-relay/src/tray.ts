import { execFile } from "node:child_process";
import { readConfig } from "./config";
import { logger } from "./logger";
import { getStatus, relayEvents, type RelayWebSocketClient } from "./websocket";

declare const require: NodeRequire;

type SystrayMenuItem = {
  title: string;
  tooltip?: string;
  checked?: boolean;
  enabled?: boolean;
  is_separator?: boolean;
};

type SystrayInstance = {
  onClick: (callback: (action: { item?: { title?: string } }) => void) => void;
  sendAction: (action: unknown) => void;
  kill: (exit?: boolean) => void;
};

export interface TrayHandle {
  ready: boolean;
  close: () => void;
}

type StartTrayOptions = {
  panelUrl: string;
  websocketClient: RelayWebSocketClient;
  onExit: () => void;
};

const ICON_RED = "";
const ICON_GREEN = "";

function buildMenu(connected: boolean): SystrayMenuItem[] {
  return [
    {
      title: `Estado: ${connected ? "Conectado" : "Desconectado"}`,
      tooltip: "Estado actual del relay",
      enabled: false,
      checked: false
    },
    {
      title: "Abrir panel de configuracion",
      tooltip: "Abrir el panel local",
      enabled: true,
      checked: false
    },
    {
      title: "",
      is_separator: true
    },
    {
      title: "Reiniciar conexion",
      tooltip: "Reiniciar la conexion al servidor",
      enabled: true,
      checked: false
    },
    {
      title: "Salir",
      tooltip: "Cerrar TPV Print Relay",
      enabled: true,
      checked: false
    }
  ];
}

function updateTrayMenu(tray: SystrayInstance, connected: boolean) {
  try {
    tray.sendAction({
      type: "update-menu",
      menu: {
        icon: connected ? ICON_GREEN : ICON_RED,
        title: "TPV Print Relay",
        tooltip: `TPV Print Relay - ${connected ? "Conectado" : "Desconectado"}`,
        items: buildMenu(connected)
      }
    });
  } catch (error) {
    logger.debug("No se pudo actualizar el menu del systray.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function openPanel(panelUrl: string) {
  execFile(
    "powershell.exe",
    ["-NoProfile", "-Command", `Start-Process "${panelUrl}"`],
    { windowsHide: true },
    (error) => {
      if (error) {
        logger.warn("No se pudo abrir el panel local.", {
          panelUrl,
          error: error.message
        });
      }
    }
  );
}

function showNotification(title: string, message: string) {
  const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedMessage = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const command =
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; " +
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null; " +
    `$xml = New-Object Windows.Data.Xml.Dom.XmlDocument; ` +
    `$xml.LoadXml(\"<toast><visual><binding template='ToastGeneric'><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual></toast>\"); ` +
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml); " +
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('TPV Print Relay').Show($toast)";

  execFile("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true }, (error) => {
    if (error) {
      logger.debug("No se pudo mostrar la notificacion del sistema.", {
        error: error.message
      });
    }
  });
}

export function startTray(options: StartTrayOptions): TrayHandle {
  try {
    const Systray = require("node-systray").default as new (options: unknown) => SystrayInstance;
    const tray = new Systray({
      menu: {
        icon: getStatus().connected ? ICON_GREEN : ICON_RED,
        title: "TPV Print Relay",
        tooltip: "TPV Print Relay",
        items: buildMenu(getStatus().connected)
      },
      debug: false,
      copyDir: true
    });

    tray.onClick((action) => {
      const title = action.item?.title;

      if (title === "Abrir panel de configuracion") {
        openPanel(options.panelUrl);
        return;
      }

      if (title === "Reiniciar conexion") {
        options.websocketClient.reconnect(readConfig());
        return;
      }

      if (title === "Salir") {
        options.onExit();
      }
    });

    const onStatus = () => {
      updateTrayMenu(tray, getStatus().connected);
    };

    const onConnectionLost = () => {
      updateTrayMenu(tray, false);
      showNotification("TPV Print Relay", "Se ha perdido la conexion con el servidor TPV");
    };

    const onConnectionRestored = () => {
      updateTrayMenu(tray, true);
      showNotification("TPV Print Relay", "Conexion restablecida");
    };

    const onPrinterError = (event: { printer: "kitchen" | "receipt"; message: string }) => {
      const printerLabel = event.printer === "kitchen" ? "cocina" : "caja";
      showNotification("TPV Print Relay", `Error en impresora de ${printerLabel}: ${event.message}`);
    };

    relayEvents.on("status", onStatus);
    relayEvents.on("connection-lost", onConnectionLost);
    relayEvents.on("connection-restored", onConnectionRestored);
    relayEvents.on("printer-error", onPrinterError);

    logger.info("Systray inicializado.");

    return {
      ready: true,
      close: () => {
        relayEvents.off("status", onStatus);
        relayEvents.off("connection-lost", onConnectionLost);
        relayEvents.off("connection-restored", onConnectionRestored);
        relayEvents.off("printer-error", onPrinterError);
        tray.kill(false);
      }
    };
  } catch (error) {
    logger.warn("No se pudo iniciar node-systray. El relay seguira sin icono de bandeja.", {
      error: error instanceof Error ? error.message : String(error)
    });

    const onConnectionLost = () => {
      showNotification("TPV Print Relay", "Se ha perdido la conexion con el servidor TPV");
    };

    const onConnectionRestored = () => {
      showNotification("TPV Print Relay", "Conexion restablecida");
    };

    const onPrinterError = (event: { printer: "kitchen" | "receipt"; message: string }) => {
      const printerLabel = event.printer === "kitchen" ? "cocina" : "caja";
      showNotification("TPV Print Relay", `Error en impresora de ${printerLabel}: ${event.message}`);
    };

    relayEvents.on("connection-lost", onConnectionLost);
    relayEvents.on("connection-restored", onConnectionRestored);
    relayEvents.on("printer-error", onPrinterError);

    return {
      ready: false,
      close: () => {
        relayEvents.off("connection-lost", onConnectionLost);
        relayEvents.off("connection-restored", onConnectionRestored);
        relayEvents.off("printer-error", onPrinterError);
      }
    };
  }
}
