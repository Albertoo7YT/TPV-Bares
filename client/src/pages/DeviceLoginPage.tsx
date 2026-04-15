import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function DeviceLoginPage() {
  const navigate = useNavigate();
  const { authorizeDevice, deviceAuthorized, isAuthenticated, isReady } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isReady) {
    return null;
  }

  if (deviceAuthorized && !isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await authorizeDevice({
        email,
        password,
        deviceName: deviceName.trim() || undefined
      });
      showToast({
        type: "success",
        title: "Dispositivo",
        message: "Dispositivo autorizado correctamente"
      });
      navigate("/login", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo autorizar el dispositivo"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-bg)] px-4 py-6 text-[var(--color-text)]">
      <section className="login-enter w-full max-w-md rounded-[1.25rem] border border-[var(--color-border)] bg-white p-6 shadow-md">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
            Deja Vu
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)]">
            Autorizar dispositivo
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Introduce las credenciales del administrador para vincular este dispositivo
          </p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Email</span>
            <input className="field-input" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Contraseña</span>
            <div className="flex gap-2">
              <input className="field-input flex-1" onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} value={password} />
              <button className="btn-secondary px-3 py-2 text-sm" onClick={() => setShowPassword((current) => !current)} type="button">
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Nombre del dispositivo</span>
            <input className="field-input" onChange={(event) => setDeviceName(event.target.value)} placeholder="Ej: Móvil camarero 1" value={deviceName} />
          </label>

          <button className="btn-primary w-full px-5 py-3 text-sm font-semibold" disabled={loading} type="submit">
            {loading ? "Autorizando..." : "Autorizar dispositivo"}
          </button>
        </form>

        <div className="mt-4 min-h-6 text-center">
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
