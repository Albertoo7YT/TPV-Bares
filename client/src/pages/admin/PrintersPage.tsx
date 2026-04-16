import { useEffect, useMemo, useState } from "react";
import Spinner from "../../components/Spinner";
import Skeleton from "../../components/Skeleton";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type SettingsResponse = {
  id: string;
  relayToken: string | null;
  autoPrintKitchen: boolean;
  autoPrintReceipt: boolean;
  printModifications: boolean;
  kitchenCopies: number;
  ticketMessage: string | null;
  ticketWidth: number;
};

type RelayStatusResponse = {
  connected: boolean;
  connectedAt: string | null;
  deviceName: string | null;
  deviceIp: string | null;
  uptimeMs: number | null;
  lastError: string | null;
  printers: {
    kitchen: "ok" | "error" | "disabled";
    receipt: "ok" | "error" | "disabled";
  };
};

type FormState = {
  relayToken: string | null;
  autoPrintKitchen: boolean;
  autoPrintReceipt: boolean;
  printModifications: boolean;
  kitchenCopies: number;
  ticketMessage: string;
  ticketWidth: number;
};

const defaultForm: FormState = {
  relayToken: null,
  autoPrintKitchen: true,
  autoPrintReceipt: true,
  printModifications: true,
  kitchenCopies: 1,
  ticketMessage: "",
  ticketWidth: 80
};

export default function PrintersPage() {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [restaurantId, setRestaurantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [relayAction, setRelayAction] = useState<"token" | "kitchen" | "receipt" | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [settings, status] = await Promise.all([
          api.get<SettingsResponse>("/settings"),
          api.get<RelayStatusResponse>("/relay/status").catch(() => null)
        ]);

        if (cancelled) {
          return;
        }

        setRestaurantId(settings.id);
        setForm({
          relayToken: settings.relayToken,
          autoPrintKitchen: settings.autoPrintKitchen,
          autoPrintReceipt: settings.autoPrintReceipt,
          printModifications: settings.printModifications,
          kitchenCopies: settings.kitchenCopies,
          ticketMessage: settings.ticketMessage ?? "",
          ticketWidth: settings.ticketWidth ?? 80
        });
        setRelayStatus(status);
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Impresoras",
            message: error instanceof Error ? error.message : "No se pudo cargar la configuracion"
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    const interval = window.setInterval(() => {
      void api
        .get<RelayStatusResponse>("/relay/status")
        .then((status) => setRelayStatus(status))
        .catch(() => setRelayStatus(null));
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [showToast]);

  const relayServerUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.location.origin;
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);

    try {
      const updated = await api.put<SettingsResponse>("/settings", {
        autoPrintKitchen: form.autoPrintKitchen,
        autoPrintReceipt: form.autoPrintReceipt,
        printModifications: form.printModifications,
        kitchenCopies: form.kitchenCopies,
        ticketMessage: form.ticketMessage.trim() || null,
        ticketWidth: form.ticketWidth
      });

      setRestaurantId(updated.id);
      setForm({
        relayToken: updated.relayToken,
        autoPrintKitchen: updated.autoPrintKitchen,
        autoPrintReceipt: updated.autoPrintReceipt,
        printModifications: updated.printModifications,
        kitchenCopies: updated.kitchenCopies,
        ticketMessage: updated.ticketMessage ?? "",
        ticketWidth: updated.ticketWidth ?? 80
      });

      showToast({
        type: "success",
        title: "Impresoras",
        message: "Configuracion de impresion guardada"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Impresoras",
        message: error instanceof Error ? error.message : "No se pudo guardar la configuracion"
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyText(value: string, label: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast({
        type: "success",
        title: "Print Relay",
        message: `${label} copiado al portapapeles`
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Print Relay",
        message: error instanceof Error ? error.message : `No se pudo copiar ${label.toLowerCase()}`
      });
    }
  }

  async function handleCopyRelayToken() {
    if (!form.relayToken) {
      return;
    }

    await handleCopyText(form.relayToken, "Token del relay");
  }

  async function handleRegenerateRelayToken() {
    setRelayAction("token");

    try {
      const updated = await api.post<SettingsResponse>("/settings/relay-token/regenerate");
      setRestaurantId(updated.id);
      setForm((current) => ({
        ...current,
        relayToken: updated.relayToken
      }));
      showToast({
        type: "success",
        title: "Print Relay",
        message: "Se ha generado un nuevo token. El relay actual tendra que reconectarse."
      });
      const status = await api.get<RelayStatusResponse>("/relay/status").catch(() => null);
      setRelayStatus(status);
    } catch (error) {
      showToast({
        type: "error",
        title: "Print Relay",
        message: error instanceof Error ? error.message : "No se pudo regenerar el token"
      });
    } finally {
      setRelayAction(null);
    }
  }

  async function handleRelayTest(printer: "kitchen" | "receipt") {
    setRelayAction(printer);

    try {
      await api.post(`/relay/test/${printer}`);
      const status = await api.get<RelayStatusResponse>("/relay/status");
      setRelayStatus(status);
      showToast({
        type: "success",
        title: "Print Relay",
        message: printer === "kitchen" ? "Test de cocina enviado al relay" : "Test de caja enviado al relay"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Print Relay",
        message: error instanceof Error ? error.message : "No se pudo enviar el test"
      });
    } finally {
      setRelayAction(null);
    }
  }

  if (loading) {
    return (
      <section className="space-y-6 page-enter">
        <div className="surface-card p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-72" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-44 w-full md:col-span-2" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Impresoras</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Conecta el Print Relay y ajusta el formato real del ticket.
          </p>
        </div>
        <button
          className="btn-primary px-4 py-2.5 text-sm font-medium"
          disabled={saving}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar cambios"}
        </button>
      </header>

      <section className="surface-card p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Print Relay</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Estado de conexion, token y datos para vincular el ejecutable del relay.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              relayStatus?.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                relayStatus?.connected ? "animate-pulse bg-emerald-500" : "bg-red-500"
              }`}
            />
            {relayStatus?.connected ? "Print Relay conectado" : "Print Relay desconectado"}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-sm font-medium text-[var(--color-text)]">Estado del relay</p>
              {relayStatus?.connected ? (
                <div className="mt-3 grid gap-2 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
                  <p>Dispositivo: <span className="font-medium text-[var(--color-text)]">{relayStatus.deviceName ?? "Sin nombre"}</span></p>
                  <p>IP: <span className="font-medium text-[var(--color-text)]">{relayStatus.deviceIp ?? "Sin IP"}</span></p>
                  <p>Uptime: <span className="font-medium text-[var(--color-text)]">{formatUptime(relayStatus.uptimeMs)}</span></p>
                  <p>Error: <span className="font-medium text-[var(--color-text)]">{relayStatus.lastError ?? "Sin errores"}</span></p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
                  <p>Instala el ejecutable del relay en un PC Windows con acceso a las impresoras.</p>
                  <p>Introduce la URL del servidor, el token y el restaurantId, y deja el relay en segundo plano.</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Token de conexion</p>
                  <p className="mt-1 font-mono text-sm text-[var(--color-text-muted)]">{maskRelayToken(form.relayToken)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary px-4 py-2.5 text-sm font-medium" onClick={() => void handleCopyRelayToken()} type="button">
                    Copiar token
                  </button>
                  <button className="btn-danger px-4 py-2.5 text-sm font-medium" disabled={relayAction === "token"} onClick={() => void handleRegenerateRelayToken()} type="button">
                    {relayAction === "token" ? <Spinner className="h-4 w-4" label="Generando" /> : "Generar nuevo token"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Datos para conectar el relay</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Copia estos valores en el panel local del ejecutable.
                </p>
              </div>

              <div className="mt-4 grid gap-3">
                <ConnectionField label="URL del servidor" value={relayServerUrl || "Sin URL"} onCopy={() => void handleCopyText(relayServerUrl, "URL del servidor")} />
                <ConnectionField label="Restaurant ID" value={restaurantId || "Sin ID"} onCopy={() => void handleCopyText(restaurantId, "Restaurant ID")} />
                <ConnectionField label="Token del relay" value={form.relayToken ?? "Sin token"} onCopy={() => void handleCopyRelayToken()} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PrinterCard title="Impresora de cocina" description="Se imprime al recibir pedido." printerStatus={relayStatus?.printers.kitchen ?? "disabled"} actionLabel={relayAction === "kitchen" ? "Enviando..." : "Imprimir test"} onTest={() => void handleRelayTest("kitchen")} />
              <PrinterCard title="Impresora de caja" description="Se imprime al cobrar la cuenta." printerStatus={relayStatus?.printers.receipt ?? "disabled"} actionLabel={relayAction === "receipt" ? "Enviando..." : "Imprimir test"} onTest={() => void handleRelayTest("receipt")} />
            </div>
          </div>

          <div className="space-y-4">
            <ToggleRow checked={form.autoPrintKitchen} label="Imprimir automaticamente en cocina" description="Activa la impresion automatica al crear un pedido." onChange={() => updateField("autoPrintKitchen", !form.autoPrintKitchen)} />
            <ToggleRow checked={form.autoPrintReceipt} label="Imprimir automaticamente al cobrar" description="Activa la impresion automatica al cobrar una cuenta." onChange={() => updateField("autoPrintReceipt", !form.autoPrintReceipt)} />
            <ToggleRow checked={form.printModifications} label="Imprimir modificaciones en cocina" description="Imprime tickets adicionales cuando se modifica un pedido existente." onChange={() => updateField("printModifications", !form.printModifications)} />

            <Field label="Ancho del ticket">
              <select className="field-input" onChange={(event) => updateField("ticketWidth", Number(event.target.value))} value={form.ticketWidth}>
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
            </Field>

            <Field label="Copias del ticket de cocina">
              <select className="field-input" onChange={(event) => updateField("kitchenCopies", Number(event.target.value))} value={form.kitchenCopies}>
                <option value={1}>1 copia</option>
                <option value={2}>2 copias</option>
              </select>
            </Field>

            <Field label="Mensaje para tickets de caja">
              <textarea className="field-input min-h-28" onChange={(event) => updateField("ticketMessage", event.target.value)} placeholder="Gracias por tu visita" value={form.ticketMessage} />
            </Field>
          </div>
        </div>
      </section>
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">{props.label}</span>
      {props.children}
    </label>
  );
}

function ToggleRow(props: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{props.label}</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{props.description}</p>
      </div>
      <button
        aria-label={props.label}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-200 ${props.checked ? "bg-emerald-500" : "bg-[#ddd6cb]"}`}
        onClick={props.onChange}
        type="button"
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${props.checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

function PrinterCard(props: {
  title: string;
  description: string;
  printerStatus: "ok" | "error" | "disabled";
  onTest: () => void;
  actionLabel: string;
}) {
  const statusMap = {
    ok: { label: "Conectada", tone: "bg-emerald-50 text-emerald-700" },
    error: { label: "Error", tone: "bg-red-50 text-red-700" },
    disabled: { label: "Desactivada", tone: "bg-slate-100 text-slate-600" }
  } as const;

  const current = statusMap[props.printerStatus];

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{props.title}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{props.description}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${current.tone}`}>{current.label}</span>
      </div>
      <button className="btn-secondary mt-4 px-4 py-2.5 text-sm font-medium" onClick={props.onTest} type="button">
        {props.actionLabel}
      </button>
    </div>
  );
}

function ConnectionField(props: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{props.label}</p>
          <p className="mt-1 break-all font-mono text-sm text-[var(--color-text)]">{props.value}</p>
        </div>
        <button className="btn-secondary shrink-0 px-4 py-2 text-sm font-medium" onClick={props.onCopy} type="button">
          Copiar
        </button>
      </div>
    </div>
  );
}

function maskRelayToken(token: string | null) {
  if (!token) {
    return "Sin token";
  }

  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function formatUptime(uptimeMs: number | null) {
  if (!uptimeMs || uptimeMs < 0) {
    return "Sin datos";
  }

  const totalMinutes = Math.floor(uptimeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
