import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type Device = {
  id: string;
  deviceName: string;
  userAgent: string;
  lastUsed: string;
  active: boolean;
  createdAt: string;
};

export default function DevicesAdminPage() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDevices();
  }, []);

  async function loadDevices() {
    try {
      setLoading(true);
      setDevices(await api.get<Device[]>("/devices"));
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar los dispositivos";
      setError(message);
      showToast({ type: "error", title: "Dispositivos", message });
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    setBusyId(deviceId);
    try {
      await api.patch(`/devices/${deviceId}/revoke`);
      showToast({ type: "success", title: "Dispositivos", message: "Dispositivo revocado" });
      await loadDevices();
    } catch (actionError) {
      showToast({
        type: "error",
        title: "Dispositivos",
        message: actionError instanceof Error ? actionError.message : "No se pudo revocar"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function renameDevice(device: Device) {
    const nextName = window.prompt("Nuevo nombre del dispositivo", device.deviceName)?.trim();

    if (!nextName) {
      return;
    }

    setBusyId(device.id);

    try {
      await api.patch(`/devices/${device.id}/rename`, { deviceName: nextName });
      showToast({ type: "success", title: "Dispositivos", message: "Nombre actualizado" });
      await loadDevices();
    } catch (actionError) {
      showToast({
        type: "error",
        title: "Dispositivos",
        message: actionError instanceof Error ? actionError.message : "No se pudo renombrar"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDevice(deviceId: string) {
    if (!window.confirm("¿Eliminar este dispositivo autorizado?")) {
      return;
    }

    setBusyId(deviceId);

    try {
      await api.delete(`/devices/${deviceId}`);
      showToast({ type: "success", title: "Dispositivos", message: "Dispositivo eliminado" });
      await loadDevices();
    } catch (actionError) {
      showToast({
        type: "error",
        title: "Dispositivos",
        message: actionError instanceof Error ? actionError.message : "No se pudo eliminar"
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Dispositivos</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {devices.length} dispositivo{devices.length === 1 ? "" : "s"} autorizado{devices.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="surface-card p-6">
          <Spinner className="h-5 w-5" label="Cargando dispositivos" />
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <article key={device.id} className="surface-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">{device.deviceName}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${device.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {device.active ? "Activo" : "Revocado"}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Último uso: {formatDateTime(device.lastUsed)}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {summarizeUserAgent(device.userAgent)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost px-3 py-2 text-sm" disabled={busyId === device.id} onClick={() => void renameDevice(device)} type="button">
                    Renombrar
                  </button>
                  <button className="btn-secondary px-3 py-2 text-sm" disabled={busyId === device.id || !device.active} onClick={() => void revokeDevice(device.id)} type="button">
                    {busyId === device.id ? "Procesando..." : "Revocar"}
                  </button>
                  <button className="btn-danger px-3 py-2 text-sm" disabled={busyId === device.id} onClick={() => void deleteDevice(device.id)} type="button">
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function summarizeUserAgent(userAgent: string) {
  const value = userAgent.toLowerCase();

  if (value.includes("android")) return "Chrome Android";
  if (value.includes("iphone") || value.includes("ipad")) return "Safari iOS";
  if (value.includes("windows")) return "Chrome Windows";
  if (value.includes("mac os")) return "Safari macOS";

  return userAgent;
}
