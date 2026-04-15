const MASKED_TOKEN = "****";
const form = document.getElementById("config-form");
const formStatus = document.getElementById("form-status");
const logOutput = document.getElementById("log-output");

const printerFields = {
  kitchen: {
    enabled: document.getElementById("kitchen-enabled"),
    type: document.getElementById("kitchen-type"),
    usbPort: document.getElementById("kitchen-usbPort"),
    networkIp: document.getElementById("kitchen-networkIp"),
    networkPort: document.getElementById("kitchen-networkPort"),
    usbFields: document.getElementById("kitchen-usb-fields"),
    networkFields: document.getElementById("kitchen-network-fields"),
    status: document.getElementById("kitchen-printer-status"),
    help: document.getElementById("kitchen-help")
  },
  receipt: {
    enabled: document.getElementById("receipt-enabled"),
    type: document.getElementById("receipt-type"),
    usbPort: document.getElementById("receipt-usbPort"),
    networkIp: document.getElementById("receipt-networkIp"),
    networkPort: document.getElementById("receipt-networkPort"),
    usbFields: document.getElementById("receipt-usb-fields"),
    networkFields: document.getElementById("receipt-network-fields"),
    status: document.getElementById("receipt-printer-status"),
    help: document.getElementById("receipt-help")
  }
};

const statusNodes = {
  indicator: document.getElementById("status-indicator"),
  text: document.getElementById("status-text"),
  serverUrl: document.getElementById("server-url-value"),
  uptime: document.getElementById("uptime-value"),
  kitchen: document.getElementById("last-kitchen-value"),
  receipt: document.getElementById("last-receipt-value")
};

let availablePrinters = [];
let statusTimer = null;
let logTimer = null;

function setFormStatus(message, isError = false) {
  formStatus.textContent = message;
  formStatus.style.color = isError ? "#b42318" : "#6b7280";
}

function setPrinterHelp(printer, message, isError = false) {
  const node = printerFields[printer].help;
  node.textContent = message;
  node.style.color = isError ? "#b42318" : "#6b7280";
}

function formatRelativeTime(value) {
  if (!value) {
    return "Nunca";
  }

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) {
    return "-";
  }

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);

  if (minutes < 1) {
    return "Hace menos de 1 minuto";
  }

  if (minutes < 60) {
    return `Hace ${minutes} minuto${minutes === 1 ? "" : "s"}`;
  }

  return `Hace ${hours} hora${hours === 1 ? "" : "s"}`;
}

function formatDuration(ms) {
  if (!ms || ms < 0) {
    return "-";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function applyPrinterVisibility(printer) {
  const fields = printerFields[printer];
  const isUsb = fields.type.value === "usb";
  fields.usbFields.classList.toggle("hidden", !isUsb);
  fields.networkFields.classList.toggle("hidden", isUsb);
}

function renderPrinterOptions() {
  Object.values(printerFields).forEach((fields) => {
    const currentValue = fields.usbPort.value;
    const options = ['<option value="">Selecciona una impresora o puerto</option>']
      .concat(
        availablePrinters.map((printer) => {
          const selected = printer.value === currentValue ? " selected" : "";
          return `<option value="${printer.value}"${selected}>${printer.label}</option>`;
        })
      )
      .join("");

    fields.usbPort.innerHTML = options;

    if (currentValue && !availablePrinters.some((printer) => printer.value === currentValue)) {
      const option = document.createElement("option");
      option.value = currentValue;
      option.textContent = currentValue;
      option.selected = true;
      fields.usbPort.appendChild(option);
    }
  });
}

function applyConfig(config) {
  document.getElementById("serverUrl").value = config.serverUrl || "";
  document.getElementById("authToken").value = config.authToken || "";
  document.getElementById("restaurantId").value = config.restaurantId || "";
  document.getElementById("autoReconnect").value = String(config.autoReconnect);
  document.getElementById("reconnectInterval").value = String(config.reconnectInterval || 5000);

  ["kitchen", "receipt"].forEach((printer) => {
    const cfg = config.printers[printer];
    const fields = printerFields[printer];
    fields.enabled.value = String(cfg.enabled);
    fields.type.value = cfg.type;
    fields.usbPort.value = cfg.usbPort || "";
    fields.networkIp.value = cfg.networkIp || "";
    fields.networkPort.value = String(cfg.networkPort || 9100);
    applyPrinterVisibility(printer);
  });

  renderPrinterOptions();
}

function collectConfig() {
  return {
    serverUrl: document.getElementById("serverUrl").value.trim(),
    authToken: document.getElementById("authToken").value.trim(),
    restaurantId: document.getElementById("restaurantId").value.trim(),
    autoReconnect: document.getElementById("autoReconnect").value === "true",
    reconnectInterval: Number(document.getElementById("reconnectInterval").value || 5000),
    printers: {
      kitchen: {
        enabled: printerFields.kitchen.enabled.value === "true",
        type: printerFields.kitchen.type.value,
        usbPort: printerFields.kitchen.usbPort.value,
        networkIp: printerFields.kitchen.networkIp.value.trim(),
        networkPort: Number(printerFields.kitchen.networkPort.value || 9100)
      },
      receipt: {
        enabled: printerFields.receipt.enabled.value === "true",
        type: printerFields.receipt.type.value,
        usbPort: printerFields.receipt.usbPort.value,
        networkIp: printerFields.receipt.networkIp.value.trim(),
        networkPort: Number(printerFields.receipt.networkPort.value || 9100)
      }
    }
  };
}

function updateStatusView(status) {
  const connected = Boolean(status.connected);

  statusNodes.indicator.classList.toggle("online", connected);
  statusNodes.indicator.classList.toggle("offline", !connected);
  statusNodes.text.textContent = connected ? "Conectado" : "Desconectado";
  statusNodes.serverUrl.textContent = status.serverUrl || "-";
  statusNodes.uptime.textContent = formatDuration(status.uptime);
  statusNodes.kitchen.textContent = formatRelativeTime(status.lastPrintKitchen);
  statusNodes.receipt.textContent = formatRelativeTime(status.lastPrintReceipt);

  ["kitchen", "receipt"].forEach((printer) => {
    const printerStatus = status.printers[printer];
    const node = printerFields[printer].status;
    const label =
      printerStatus.status === "ok"
        ? "OK"
        : printerStatus.status === "error"
          ? `Error${status.lastError ? `: ${status.lastError}` : ""}`
          : "Desactivada";

    node.textContent = label;
    node.className =
      printerStatus.status === "ok"
        ? "printer-state state-ok"
        : printerStatus.status === "error"
          ? "printer-state state-error"
          : "printer-state state-disabled";
  });
}

async function loadConfig() {
  const response = await fetch("/api/config");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const config = await response.json();
  applyConfig(config);
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    updateStatusView(await response.json());
  } catch (error) {
    statusNodes.indicator.classList.add("offline");
    statusNodes.indicator.classList.remove("online");
    statusNodes.text.textContent = "Desconectado";
    statusNodes.serverUrl.textContent = "Panel sin respuesta";
    console.error(error);
  }
}

async function refreshLogs() {
  try {
    const response = await fetch("/api/logs");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    logOutput.value = (payload.lines || []).join("\n");
    logOutput.scrollTop = logOutput.scrollHeight;
  } catch (error) {
    console.error(error);
  }
}

async function detectPrinters(targetPrinter) {
  setPrinterHelp(targetPrinter, "Detectando impresoras...");

  try {
    const response = await fetch("/api/printers");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    availablePrinters = payload.printers || [];
    renderPrinterOptions();
    setPrinterHelp(targetPrinter, `Detectadas ${availablePrinters.length} impresoras.`);
  } catch (error) {
    setPrinterHelp(targetPrinter, `No se pudieron detectar impresoras: ${error}`, true);
  }
}

async function runPrinterTest(printer) {
  setPrinterHelp(printer, "Enviando ticket de prueba...");

  try {
    const response = await fetch(`/api/test/${printer}`, {
      method: "POST"
    });
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setPrinterHelp(printer, "Ticket de prueba enviado.");
    await refreshStatus();
  } catch (error) {
    setPrinterHelp(printer, `Error de impresion: ${error}`, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("Guardando configuracion...");

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(collectConfig())
    });

    const payload = await response.json();

    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    if (payload.config) {
      applyConfig(payload.config);
    }

    if (payload.printerDiscovery) {
      availablePrinters = payload.printerDiscovery.printers || availablePrinters;
      renderPrinterOptions();
    }

    if (document.getElementById("authToken").value !== MASKED_TOKEN && payload.config?.authToken) {
      document.getElementById("authToken").value = payload.config.authToken;
    }

    setFormStatus("Configuracion guardada. Conexion reiniciada si era necesario.");
    document.getElementById("connect-button").textContent = "Reconectar";
    await refreshStatus();
  } catch (error) {
    setFormStatus(`No se pudo guardar la configuracion: ${error}`, true);
  }
});

document.querySelectorAll("[data-detect]").forEach((button) => {
  button.addEventListener("click", () => {
    detectPrinters(button.getAttribute("data-detect"));
  });
});

document.querySelectorAll("[data-test]").forEach((button) => {
  button.addEventListener("click", () => {
    runPrinterTest(button.getAttribute("data-test"));
  });
});

["kitchen", "receipt"].forEach((printer) => {
  printerFields[printer].type.addEventListener("change", () => {
    applyPrinterVisibility(printer);
  });
});

async function init() {
  setFormStatus("Cargando configuracion...");

  try {
    await Promise.all([loadConfig(), detectPrinters("kitchen"), refreshStatus(), refreshLogs()]);
    setFormStatus("Panel listo.");
    document.getElementById("connect-button").textContent = "Reconectar";
  } catch (error) {
    setFormStatus(`No se pudo iniciar el panel: ${error}`, true);
  }

  statusTimer = window.setInterval(refreshStatus, 3000);
  logTimer = window.setInterval(refreshLogs, 5000);
}

window.addEventListener("beforeunload", () => {
  if (statusTimer) {
    clearInterval(statusTimer);
  }

  if (logTimer) {
    clearInterval(logTimer);
  }
});

void init();
