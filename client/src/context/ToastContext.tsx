import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type ToastType = "success" | "error" | "warning" | "info";

type ToastInput = {
  title?: string;
  message: string;
  type?: ToastType;
};

type ToastRecord = ToastInput & {
  id: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastStyles: Record<ToastType, string> = {
  success: "border-l-[4px] border-l-emerald-600 border-[var(--color-border)] bg-white text-[var(--color-text)]",
  error: "border-l-[4px] border-l-red-600 border-[var(--color-border)] bg-white text-[var(--color-text)]",
  warning: "border-l-[4px] border-l-amber-500 border-[var(--color-border)] bg-white text-[var(--color-text)]",
  info: "border-l-[4px] border-l-blue-600 border-[var(--color-border)] bg-white text-[var(--color-text)]"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((currentToasts) =>
          currentToasts.filter((currentToast) => currentToast.id !== toast.id)
        );
      }, 3000)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast: (input) => {
        const id =
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        setToasts((currentToasts) => [
          ...currentToasts,
          {
            ...input,
            id,
            type: input.type ?? "info"
          }
        ]);
      },
      dismissToast: (id) => {
        setToasts((currentToasts) =>
          currentToasts.filter((toast) => toast.id !== id)
        );
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={value.dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}

function ToastViewport(props: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  const { toasts, onDismiss } = props;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-3 px-4 md:top-5">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          aria-label={`Cerrar notificacion: ${toast.title ?? toast.message}`}
          className={`toast-enter pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-left shadow-md ${toastStyles[toast.type]}`}
          onClick={() => onDismiss(toast.id)}
          type="button"
        >
          <span className="mt-0.5 text-base">{getToastIcon(toast.type)}</span>
          <span className="min-w-0 flex-1">
            {toast.title ? (
              <p className="text-sm font-bold text-[var(--color-text)]">{toast.title}</p>
            ) : null}
            <p className={`text-sm text-[var(--color-text-muted)] ${toast.title ? "mt-0.5" : ""}`}>{toast.message}</p>
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">×</span>
        </button>
      ))}
    </div>
  );
}

function getToastIcon(type: ToastType) {
  if (type === "success") {
    return "✓";
  }

  if (type === "error") {
    return "!";
  }

  if (type === "warning") {
    return "•";
  }

  return "i";
}
