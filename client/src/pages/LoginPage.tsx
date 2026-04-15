import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const PIN_LENGTH = 4;
const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0"];

export default function LoginPage() {
  const { isAuthenticated, login, user, restaurantName, deviceAuthorized, clearDeviceAuthorization, isReady } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!deviceAuthorized) {
      return;
    }

    if (pin.length !== PIN_LENGTH || loading) {
      return;
    }

    void attemptLogin(pin);
  }, [loading, pin]);

  if (!isReady) {
    return null;
  }

  if (!deviceAuthorized) {
    return <Navigate replace to="/device-login" />;
  }

  if (isAuthenticated && user) {
    return <Navigate replace to={getHomeRouteForRole(user.role)} />;
  }

  const appendDigit = (digit: string) => {
    if (loading || pin.length >= PIN_LENGTH) {
      return;
    }

    setPin((currentPin) => `${currentPin}${digit}`);
    setError(null);
  };

  const removeDigit = () => {
    if (loading) {
      return;
    }

    setPin((currentPin) => currentPin.slice(0, -1));
    setError(null);
  };

  const attemptLogin = async (nextPin: string) => {
    setLoading(true);
    setError(null);

    try {
      await login(nextPin);
      navigate("/");
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "PIN incorrecto";
      setError(message);
      if (message === "Dispositivo no autorizado") {
        clearDeviceAuthorization();
        navigate("/device-login", { replace: true });
        return;
      }
      setShake(true);
      setPin("");
      window.setTimeout(() => setShake(false), 420);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-bg)] px-4 py-6 text-[var(--color-text)]">
      <section className="login-enter w-full max-w-sm rounded-[1.25rem] border border-[var(--color-border)] bg-white p-6 shadow-md">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
            TPV Restaurante
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-[var(--color-text)]">
            Deja Vu
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Introduce tu PIN
          </p>
        </div>

        <div className={`mt-8 ${shake ? "pin-shake" : ""}`}>
          <div className="mx-auto flex max-w-52 items-center justify-between gap-3">
            {Array.from({ length: PIN_LENGTH }, (_, index) => {
              const filled = index < pin.length;

              return (
                <div
                  key={index}
                  className={`h-4 w-4 rounded-full border transition-all duration-200 ${
                    filled
                      ? "scale-110 border-[var(--color-primary)] bg-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-white"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {keypad.map((digit, index) =>
            digit ? (
              <button
                key={digit}
                className="min-h-[72px] rounded-full border border-[var(--color-border)] bg-white text-2xl font-semibold text-[var(--color-text)] shadow-sm transition-all duration-200 active:scale-[0.97] active:bg-[var(--color-surface-muted)]"
                onClick={() => appendDigit(digit)}
                type="button"
              >
                {digit}
              </button>
            ) : (
              <div key={`empty-${index}`} />
            )
          )}

          <button
            className="col-start-3 min-h-[72px] rounded-full border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-text-muted)] shadow-sm transition-all duration-200 active:scale-[0.97] active:bg-[var(--color-surface-muted)]"
            onClick={removeDigit}
            type="button"
          >
            Borrar
          </button>
        </div>

        <div className="mt-5 min-h-6 text-center">
          {loading ? (
            <p className="text-sm text-[var(--color-primary)]">Validando PIN...</p>
          ) : error ? (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          ) : (
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Toca 4 digitos para entrar</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{restaurantName ?? ""}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function getHomeRouteForRole(role: "ADMIN" | "WAITER" | "KITCHEN") {
  if (role === "KITCHEN") {
    return "/kitchen-disabled";
  }

  if (role === "ADMIN") {
    return "/admin";
  }

  return "/tables";
}
