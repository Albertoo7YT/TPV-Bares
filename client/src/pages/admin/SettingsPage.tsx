import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "../../components/Skeleton";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";
import { getStoredToken } from "../../services/tokenStorage";

type SettingsResponse = {
  id: string;
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  ticketMessage: string | null;
  taxRate: number;
  taxIncluded: boolean;
  currency: string;
  currencySymbol: string;
  openingTime: string;
  closingTime: string;
  kitchenAlertMinutes: number;
  allowTakeaway: boolean;
  notificationSounds: boolean;
  relayToken: string | null;
  autoPrintKitchen: boolean;
  autoPrintReceipt: boolean;
  printModifications: boolean;
  kitchenCopies: number;
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

type FormState = Omit<SettingsResponse, "id" | "ticketMessage"> & {
  ticketMessage: string;
};

type FormErrors = Partial<Record<"name" | "address" | "phone" | "taxRate" | "kitchenAlertMinutes" | "logo", string>>;

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const defaultForm: FormState = {
  name: "",
  address: "",
  phone: "",
  logoUrl: null,
  ticketMessage: "",
  taxRate: 10,
  taxIncluded: true,
  currency: "EUR",
  currencySymbol: "€",
  openingTime: "10:00",
  closingTime: "23:00",
  kitchenAlertMinutes: 10,
  allowTakeaway: false,
  notificationSounds: true,
  relayToken: null,
  autoPrintKitchen: true,
  autoPrintReceipt: true,
  printModifications: true,
  kitchenCopies: 1
};

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | null>(null);
  const [relayAction, setRelayAction] = useState<"token" | "kitchen" | "receipt" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await api.get<SettingsResponse>("/settings");

        if (!cancelled) {
          setForm({
            ...settings,
            ticketMessage: settings.ticketMessage ?? ""
          });
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Configuracion",
            message: error instanceof Error ? error.message : "No se pudo cargar la configuracion"
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadRelayStatus() {
      try {
        const status = await api.get<RelayStatusResponse>("/relay/status");

        if (!cancelled) {
          setRelayStatus(status);
        }
      } catch {
        if (!cancelled) {
          setRelayStatus(null);
        }
      }
    }

    void loadRelayStatus();
    const interval = window.setInterval(() => {
      void loadRelayStatus();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const expectedPreview = useMemo(() => {
    return {
      ivaText: form.taxIncluded ? "IVA incluido en precios" : "IVA se suma al precio",
      schedule: `${form.openingTime} - ${form.closingTime}`
    };
  }, [form.closingTime, form.openingTime, form.taxIncluded]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) nextErrors.name = "El nombre es obligatorio";
    if (!form.address.trim()) nextErrors.address = "La direccion es obligatoria";
    if (!form.phone.trim()) nextErrors.phone = "El telefono es obligatorio";
    if (!Number.isFinite(form.taxRate) || form.taxRate < 0) {
      nextErrors.taxRate = "El IVA debe ser un numero valido";
    }
    if (!Number.isInteger(form.kitchenAlertMinutes) || form.kitchenAlertMinutes < 1) {
      nextErrors.kitchenAlertMinutes = "Introduce minutos validos";
    }

    return nextErrors;
  }

  async function handleSave() {
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);

    try {
      const updated = await api.put<SettingsResponse>("/settings", {
        ...form,
        ticketMessage: form.ticketMessage.trim() || null
      });

      setForm({
        ...updated,
        ticketMessage: updated.ticketMessage ?? ""
      });
      showToast({
        type: "success",
        title: "Configuracion",
        message: "Cambios guardados correctamente"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Configuracion",
        message: error instanceof Error ? error.message : "No se pudo guardar la configuracion"
      });
    } finally {
      setSaving(false);
    }
  }

  async function processLogoFile(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((current) => ({ ...current, logo: "Solo se permiten JPG, PNG o WebP" }));
      return;
    }

    setUploadingLogo(true);
    setErrors((current) => ({ ...current, logo: undefined }));

    try {
      const blob = await resizeImage(file);

      if (blob.size > MAX_IMAGE_SIZE) {
        throw new Error("La imagen final supera 2MB");
      }

      const formData = new FormData();
      formData.append("image", new File([blob], file.name, { type: blob.type || file.type }));

      const token = getStoredToken();
      const response = await fetch(buildApiUrl("/upload/restaurant-logo"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "No se pudo subir el logo");
      }

      const payload = (await response.json()) as { url: string };
      updateField("logoUrl", payload.url);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        logo: error instanceof Error ? error.message : "No se pudo procesar el logo"
      }));
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void processLogoFile(file);
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processLogoFile(file);
    }
  }

  async function handleReset() {
    if (resetConfirmation !== "RESETEAR") {
      setErrors((current) => ({ ...current, logo: undefined }));
      showToast({
        type: "warning",
        title: "Reset",
        message: 'Escribe "RESETEAR" para confirmar'
      });
      return;
    }

    setResetting(true);

    try {
      await api.post("/settings/reset", { confirmation: resetConfirmation });
      setResetConfirmation("");
      showToast({
        type: "success",
        title: "Reset completado",
        message: "Se eliminaron pedidos, cuentas y cierres de caja"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Reset",
        message: error instanceof Error ? error.message : "No se pudo resetear"
      });
    } finally {
      setResetting(false);
    }
  }

  async function handleExport() {
    setExporting(true);

    try {
      const payload = await api.get<unknown>("/settings/export");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `restaurant-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast({
        type: "error",
        title: "Exportar",
        message: error instanceof Error ? error.message : "No se pudo exportar"
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleRegenerateRelayToken() {
    setRelayAction("token");

    try {
      const updated = await api.post<SettingsResponse>("/settings/relay-token/regenerate");
      setForm({
        ...updated,
        ticketMessage: updated.ticketMessage ?? ""
      });
      showToast({
        type: "success",
        title: "Print Relay",
        message: "Se ha generado un nuevo token. El relay actual tendra que reconectarse."
      });
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

  async function handleCopyRelayToken() {
    if (!form.relayToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(form.relayToken);
      showToast({
        type: "success",
        title: "Print Relay",
        message: "Token copiado al portapapeles"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Print Relay",
        message: error instanceof Error ? error.message : "No se pudo copiar el token"
      });
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
        message:
          printer === "kitchen"
            ? "Test de cocina enviado al relay"
            : "Test de caja enviado al relay"
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
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-40 w-full md:col-span-2" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Configuracion del restaurante</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Ajusta datos generales, fiscalidad, operativa y tareas de mantenimiento del TPV.
        </p>
      </header>

      <section className="surface-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Datos del restaurante</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Se usan en el header del TPV y en los tickets.
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
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--color-text)]">Logo</p>
            <button
              className={`flex min-h-72 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-center transition-all duration-200 ${
                errors.logo
                  ? "border-red-300 bg-red-50"
                  : "border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-white"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              type="button"
            >
              {form.logoUrl ? (
                <img
                  alt="Logo del restaurante"
                  className="max-h-56 w-full rounded-xl object-contain"
                  src={buildAssetUrl(form.logoUrl)}
                />
              ) : (
                <>
                  <UploadIcon />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      Arrastra un logo o haz clic para subir
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      JPG, PNG o WebP · max 2MB · redimensionado a 800x800
                    </p>
                  </div>
                </>
              )}
            </button>
            <input
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
              ref={fileInputRef}
              type="file"
            />
            {errors.logo ? <p className="text-sm text-[var(--color-danger)]">{errors.logo}</p> : null}
            <div className="flex gap-3">
              <button
                className="btn-secondary px-4 py-2.5 text-sm font-medium"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {uploadingLogo ? <Spinner className="h-4 w-4" label="Subiendo" /> : "Subir logo"}
              </button>
              {form.logoUrl ? (
                <button
                  className="btn-danger px-4 py-2.5 text-sm font-medium"
                  onClick={() => updateField("logoUrl", null)}
                  type="button"
                >
                  Eliminar logo
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <Field error={errors.name} label="Nombre del restaurante" required>
              <input
                className={getFieldClass(Boolean(errors.name))}
                onChange={(event) => updateField("name", event.target.value)}
                value={form.name}
              />
            </Field>
            <Field error={errors.address} label="Direccion" required>
              <input
                className={getFieldClass(Boolean(errors.address))}
                onChange={(event) => updateField("address", event.target.value)}
                value={form.address}
              />
            </Field>
            <Field error={errors.phone} label="Telefono" required>
              <input
                className={getFieldClass(Boolean(errors.phone))}
                onChange={(event) => updateField("phone", event.target.value)}
                type="tel"
                value={form.phone}
              />
            </Field>
            <Field label="Mensaje para tickets">
              <textarea
                className={getFieldClass(false, "min-h-28")}
                onChange={(event) => updateField("ticketMessage", event.target.value)}
                placeholder="¡Gracias por tu visita!"
                value={form.ticketMessage}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Configuracion fiscal</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Estos ajustes afectan al calculo de todas las cuentas.
          </p>

          <div className="mt-5 grid gap-4">
            <Field error={errors.taxRate} label="Tipo de IVA (%)">
              <input
                className={getFieldClass(Boolean(errors.taxRate))}
                min="0"
                onChange={(event) => updateField("taxRate", Number(event.target.value))}
                step="0.01"
                type="number"
                value={form.taxRate}
              />
            </Field>

            <ToggleRow
              checked={form.taxIncluded}
              description={expectedPreview.ivaText}
              label="IVA incluido en precios"
              onChange={() => updateField("taxIncluded", !form.taxIncluded)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Moneda">
                <select
                  className={getFieldClass(false)}
                  onChange={(event) => {
                    const currency = event.target.value;
                    updateField("currency", currency);
                    updateField("currencySymbol", currency === "USD" ? "$" : currency === "GBP" ? "£" : "€");
                  }}
                  value={form.currency}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </Field>
              <Field label="Simbolo">
                <input
                  className={getFieldClass(false)}
                  onChange={(event) => updateField("currencySymbol", event.target.value)}
                  value={form.currencySymbol}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="surface-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Configuracion operativa</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Ajusta horario, alertas de cocina y opciones operativas.
          </p>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hora de apertura">
                <input
                  className={getFieldClass(false)}
                  onChange={(event) => updateField("openingTime", event.target.value)}
                  type="time"
                  value={form.openingTime}
                />
              </Field>
              <Field label="Hora de cierre">
                <input
                  className={getFieldClass(false)}
                  onChange={(event) => updateField("closingTime", event.target.value)}
                  type="time"
                  value={form.closingTime}
                />
              </Field>
            </div>

            <Field error={errors.kitchenAlertMinutes} label="Tiempo de alerta en cocina (min)">
              <input
                className={getFieldClass(Boolean(errors.kitchenAlertMinutes))}
                min="1"
                onChange={(event) =>
                  updateField("kitchenAlertMinutes", Number.parseInt(event.target.value, 10) || 0)
                }
                type="number"
                value={form.kitchenAlertMinutes}
              />
            </Field>

            <ToggleRow
              checked={form.allowTakeaway}
              description="Permite crear pedidos para llevar o sin mesa asignada."
              label="Permitir pedidos sin mesa"
              onChange={() => updateField("allowTakeaway", !form.allowTakeaway)}
            />

            <ToggleRow
              checked={form.notificationSounds}
              description={`Horario operativo configurado: ${expectedPreview.schedule}`}
              label="Sonidos de notificacion"
              onChange={() => updateField("notificationSounds", !form.notificationSounds)}
            />
          </div>
        </div>
      </section>

      <section className="surface-card p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Impresoras</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Configura el Print Relay y controla el estado de cocina y caja.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              relayStatus?.connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
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
                  <p>Introduce la URL del VPS, el token y el `restaurantId`, y deja el relay en segundo plano.</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Token de conexion</p>
                  <p className="mt-1 font-mono text-sm text-[var(--color-text-muted)]">
                    {maskRelayToken(form.relayToken)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-4 py-2.5 text-sm font-medium"
                    onClick={() => void handleCopyRelayToken()}
                    type="button"
                  >
                    Copiar token
                  </button>
                  <button
                    className="btn-danger px-4 py-2.5 text-sm font-medium"
                    disabled={relayAction === "token"}
                    onClick={() => void handleRegenerateRelayToken()}
                    type="button"
                  >
                    {relayAction === "token" ? <Spinner className="h-4 w-4" label="Generando" /> : "Generar nuevo token"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PrinterCard
                actionLabel={relayAction === "kitchen" ? "Enviando..." : "Imprimir test"}
                description="Se imprime al recibir pedido."
                onTest={() => void handleRelayTest("kitchen")}
                printerStatus={relayStatus?.printers.kitchen ?? "disabled"}
                title="Impresora de cocina"
              />
              <PrinterCard
                actionLabel={relayAction === "receipt" ? "Enviando..." : "Imprimir test"}
                description="Se imprime al cobrar la cuenta."
                onTest={() => void handleRelayTest("receipt")}
                printerStatus={relayStatus?.printers.receipt ?? "disabled"}
                title="Impresora de caja"
              />
            </div>
          </div>

          <div className="space-y-4">
            <ToggleRow
              checked={form.autoPrintKitchen}
              description="Activa la impresion automatica al crear un pedido."
              label="Imprimir automaticamente en cocina"
              onChange={() => updateField("autoPrintKitchen", !form.autoPrintKitchen)}
            />
            <ToggleRow
              checked={form.autoPrintReceipt}
              description="Activa la impresion automatica al cobrar una cuenta."
              label="Imprimir automaticamente al cobrar"
              onChange={() => updateField("autoPrintReceipt", !form.autoPrintReceipt)}
            />
            <ToggleRow
              checked={form.printModifications}
              description="Imprime tickets adicionales cuando se modifica un pedido existente."
              label="Imprimir modificaciones en cocina"
              onChange={() => updateField("printModifications", !form.printModifications)}
            />

            <Field label="Copias del ticket de cocina">
              <select
                className={getFieldClass(false)}
                onChange={(event) => updateField("kitchenCopies", Number(event.target.value))}
                value={form.kitchenCopies}
              >
                <option value={1}>1 copia</option>
                <option value={2}>2 copias</option>
              </select>
            </Field>

            <Field label="Mensaje para tickets de caja">
              <textarea
                className={getFieldClass(false, "min-h-28")}
                onChange={(event) => updateField("ticketMessage", event.target.value)}
                placeholder="¡Gracias por tu visita!"
                value={form.ticketMessage}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-red-800">Zona de peligro</h2>
        <p className="mt-1 text-sm text-red-700">
          Resetea los datos operativos de prueba o exporta una copia JSON de todo el restaurante.
        </p>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-red-200 bg-white p-5">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Resetear datos de prueba</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Elimina pedidos, cuentas y cierres de caja. Mantiene productos, mesas, categorias y usuarios.
            </p>
            <div className="mt-4 grid gap-3">
              <Field label='Escribe "RESETEAR" para confirmar'>
                <input
                  className={getFieldClass(false)}
                  onChange={(event) => setResetConfirmation(event.target.value)}
                  value={resetConfirmation}
                />
              </Field>
              <button
                className="btn-danger px-4 py-2.5 text-sm font-medium"
                disabled={resetting}
                onClick={() => void handleReset()}
                type="button"
              >
                {resetting ? <Spinner className="h-4 w-4" label="Reseteando" /> : "Resetear datos de prueba"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Exportar datos</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Genera un backup JSON con configuracion, equipo, carta, mesas, cuentas y cierres.
            </p>
            <button
              className="btn-secondary mt-4 px-4 py-2.5 text-sm font-medium"
              disabled={exporting}
              onClick={() => void handleExport()}
              type="button"
            >
              {exporting ? <Spinner className="h-4 w-4" label="Exportando" /> : "Exportar datos"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

function Field(props: {
  label: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">
        {props.label}
        {props.required ? " *" : ""}
      </span>
      {props.children}
      {props.error ? <span className="mt-2 block text-sm text-[var(--color-danger)]">{props.error}</span> : null}
    </label>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{props.label}</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{props.description}</p>
      </div>
      <button
        aria-label={props.label}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-200 ${
          props.checked ? "bg-emerald-500" : "bg-[#ddd6cb]"
        }`}
        onClick={props.onChange}
        type="button"
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            props.checked ? "left-6" : "left-1"
          }`}
        />
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
    ok: {
      label: "Conectada",
      tone: "bg-emerald-50 text-emerald-700"
    },
    error: {
      label: "Error",
      tone: "bg-red-50 text-red-700"
    },
    disabled: {
      label: "Desactivada",
      tone: "bg-slate-100 text-slate-600"
    }
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
      <button
        className="btn-secondary mt-4 px-4 py-2.5 text-sm font-medium"
        onClick={props.onTest}
        type="button"
      >
        {props.actionLabel}
      </button>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-10 w-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24">
      <path d="M12 16V6m0 0-4 4m4-4 4 4M5 17.5v.5A2 2 0 0 0 7 20h10a2 2 0 0 0 2-2v-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function buildApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return `${apiBaseUrl}${path}`;
  }
  return `${apiBaseUrl}${path}`;
}

function buildAssetUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return new URL(path, apiBaseUrl).toString();
  }

  return path;
}

function getFieldClass(hasError: boolean, extraClassName = "") {
  return `field-input ${extraClassName} ${hasError ? "border-red-300 bg-red-50" : ""}`.trim();
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

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolvePromise, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("No se pudo preparar la imagen"));
        return;
      }

      const maxSize = 800;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("No se pudo convertir la imagen"));
            return;
          }
          resolvePromise(blob);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        0.88
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo cargar la imagen"));
    };

    image.src = objectUrl;
  });
}
