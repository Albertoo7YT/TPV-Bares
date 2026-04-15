import { readConfig } from "./config";
import { logger } from "./logger";
import { startLocalServer } from "./server";
import { startTray } from "./tray";
import { RelayWebSocketClient } from "./websocket";

async function main(): Promise<void> {
  const config = readConfig();
  const websocketClient = new RelayWebSocketClient();
  const localServer = startLocalServer({ websocketClient }, 9191);
  const tray = startTray({
    panelUrl: `http://127.0.0.1:${localServer.port}`,
    websocketClient,
    onExit: () => {
      void shutdown("tray-exit");
    }
  });

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Cierre solicitado (${signal}).`);

    try {
      websocketClient.disconnect();
      tray.close();
      await localServer.close();
    } catch (error) {
      logger.error("Error durante el cierre del relay.", {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  logger.info("TPV Print Relay v1.0 iniciado");

  if (config.serverUrl) {
    websocketClient.connect(config);
  } else {
    logger.warn("Relay iniciado sin serverUrl configurada.");
  }

  if (!tray.ready) {
    logger.warn("El relay sigue operativo, pero sin icono de bandeja.");
  }
}

void main().catch((error) => {
  logger.error("Fallo critico al iniciar la aplicacion.", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
