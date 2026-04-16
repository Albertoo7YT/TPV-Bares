import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Skeleton from "../../components/Skeleton";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";
import { getStoredToken } from "../../services/tokenStorage";

type SettingsResponse = {
  id: string;
  email: string;
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

type FormState = Omit<SettingsResponse, "id" | "ticketMessage"> & {
  ticketMessage: string;
};

type CredentialsFormState = {
  email: string;
  currentPassword: string;
  newPassword: string;
};

type FormErrors = Partial<
  Record<"name" | "address" | "phone" | "taxRate" | "kitchenAlertMinutes" | "logo", string>
>;

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const defaultForm: FormState = {
  email: "",
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
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [credentials, setCredentials] = useState<CredentialsFormState>({
    email: "",
    currentPassword: "",
    newPassword: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

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
          setCredentials({
            email: settings.email ?? "",
            currentPassword: "",
            newPassword: ""
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

  async function handleSaveCredentials() {
    if (!credentials.email.trim()) {
      showToast({
        type: "warning",
        title: "Credenciales",
        message: "Introduce un email valido"
      });
      return;
    }

    if (!credentials.currentPassword.trim()) {
      showToast({
        type: "warning",
        title: "Credenciales",
        message: "Introduce la contraseña actual"
      });
      return;
    }

    if (!credentials.newPassword.trim()) {
      showToast({
        type: "warning",
        title: "Credenciales",
        message: "Introduce la nueva contraseña"
      });
      return;
    }

    setSavingCredentials(true);

    try {
      await api.put("/settings/credentials", {
        email: credentials.email.trim(),
        currentPassword: credentials.currentPassword,
        newPassword: credentials.newPassword
      });

      setForm((current) => ({ ...current, email: credentials.email.trim() }));
      setCredentials((current) => ({
        ...current,
        email: current.email.trim(),
        currentPassword: "",
        newPassword: ""
      }));

      showToast({
        type: "success",
        title: "Credenciales",
        message: "Email y contraseña actualizados"
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Credenciales",
        message: error instanceof Error ? error.message : "No se pudieron actualizar las credenciales"
      });
    } finally {
      setSavingCredentials(false);
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
              <input className={getFieldClass(Boolean(errors.name))} onChange={(event) => updateField("name", event.target.value)} value={form.name} />
            </Field>
            <Field error={errors.address} label="Direccion" required>
              <input className={getFieldClass(Boolean(errors.address))} onChange={(event) => updateField("address", event.target.value)} value={form.address} />
            </Field>
            <Field error={errors.phone} label="Telefono" required>
              <input className={getFieldClass(Boolean(errors.phone))} onChange={(event) => updateField("phone", event.target.value)} type="tel" value={form.phone} />
            </Field>
            <Field label="Mensaje para tickets">
              <textarea className={getFieldClass(false, "min-h-28")} onChange={(event) => updateField("ticketMessage", event.target.value)} placeholder="¡Gracias por tu visita!" value={form.ticketMessage} />
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
              <input className={getFieldClass(Boolean(errors.taxRate))} min="0" onChange={(event) => updateField("taxRate", Number(event.target.value))} step="0.01" type="number" value={form.taxRate} />
            </Field>

            <ToggleRow checked={form.taxIncluded} description={expectedPreview.ivaText} label="IVA incluido en precios" onChange={() => updateField("taxIncluded", !form.taxIncluded)} />

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
                <input className={getFieldClass(false)} onChange={(event) => updateField("currencySymbol", event.target.value)} value={form.currencySymbol} />
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
                <input className={getFieldClass(false)} onChange={(event) => updateField("openingTime", event.target.value)} type="time" value={form.openingTime} />
              </Field>
              <Field label="Hora de cierre">
                <input className={getFieldClass(false)} onChange={(event) => updateField("closingTime", event.target.value)} type="time" value={form.closingTime} />
              </Field>
            </div>

            <Field error={errors.kitchenAlertMinutes} label="Tiempo de alerta en cocina (min)">
              <input
                className={getFieldClass(Boolean(errors.kitchenAlertMinutes))}
                min="1"
                onChange={(event) => updateField("kitchenAlertMinutes", Number.parseInt(event.target.value, 10) || 0)}
                type="number"
                value={form.kitchenAlertMinutes}
              />
            </Field>

            <ToggleRow checked={form.allowTakeaway} description="Permite crear pedidos para llevar o sin mesa asignada." label="Permitir pedidos sin mesa" onChange={() => updateField("allowTakeaway", !form.allowTakeaway)} />

            <ToggleRow checked={form.notificationSounds} description={`Horario operativo configurado: ${expectedPreview.schedule}`} label="Sonidos de notificacion" onChange={() => updateField("notificationSounds", !form.notificationSounds)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Credenciales de acceso</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Cambia el email y la contraseña que autorizan nuevos dispositivos antes de entrar con PIN.
              </p>
            </div>
            <button
              className="btn-primary px-4 py-2.5 text-sm font-medium"
              disabled={savingCredentials}
              onClick={() => void handleSaveCredentials()}
              type="button"
            >
              {savingCredentials ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar acceso"}
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Email de acceso" required>
              <input
                className={getFieldClass(false)}
                onChange={(event) =>
                  setCredentials((current) => ({ ...current, email: event.target.value }))
                }
                type="email"
                value={credentials.email}
              />
            </Field>
            <Field label="Contraseña actual" required>
              <input
                className={getFieldClass(false)}
                onChange={(event) =>
                  setCredentials((current) => ({
                    ...current,
                    currentPassword: event.target.value
                  }))
                }
                type="password"
                value={credentials.currentPassword}
              />
            </Field>
            <Field label="Nueva contraseña" required>
              <input
                className={getFieldClass(false)}
                onChange={(event) =>
                  setCredentials((current) => ({
                    ...current,
                    newPassword: event.target.value
                  }))
                }
                type="password"
                value={credentials.newPassword}
              />
            </Field>
          </div>
        </div>

        <div className="surface-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Cuentas para entrar al TPV</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Crea mas cuentas con PIN para camareros, administradores o cocina desde la gestion de usuarios.
              </p>
            </div>
            <button
              className="btn-secondary px-4 py-2.5 text-sm font-medium"
              onClick={() => navigate("/admin/users")}
              type="button"
            >
              Gestionar cuentas
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
            <p className="text-sm font-medium text-[var(--color-text)]">
              Desde Usuarios y PINs puedes:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
              <li>Crear nuevas cuentas para entrar al programa.</li>
              <li>Asignar rol de Administrador, Camarero/a o Cocina.</li>
              <li>Activar, desactivar o eliminar accesos existentes.</li>
              <li>Cambiar el PIN de cualquier cuenta.</li>
            </ul>
            <button
              className="btn-primary mt-5 px-4 py-2.5 text-sm font-medium"
              onClick={() => navigate("/admin/users")}
              type="button"
            >
              Crear o editar cuentas
            </button>
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
                <input className={getFieldClass(false)} onChange={(event) => setResetConfirmation(event.target.value)} value={resetConfirmation} />
              </Field>
              <button className="btn-danger px-4 py-2.5 text-sm font-medium" disabled={resetting} onClick={() => void handleReset()} type="button">
                {resetting ? <Spinner className="h-4 w-4" label="Reseteando" /> : "Resetear datos de prueba"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="text-base font-semibold text-[var(--color-text)]">Exportar datos</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Genera un backup JSON con configuracion, equipo, carta, mesas, cuentas y cierres.
            </p>
            <button className="btn-secondary mt-4 px-4 py-2.5 text-sm font-medium" disabled={exporting} onClick={() => void handleExport()} type="button">
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
