import { useEffect, useMemo, useState } from "react";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type TurnBill = {
  id: string;
  paidAt: string;
  tableLabel: string;
  waiterName: string;
  items: number;
  total: number;
  paymentMethod: "CASH" | "CARD" | "MIXED";
};

type CurrentCashRegister = {
  id: string;
  openedAt: string;
  initialCash: number;
  totalCash: number;
  totalCard: number;
  totalSales: number;
  expectedCash: number;
  openedBy: {
    id: string;
    name: string;
    role: string;
  } | null;
  bills: TurnBill[];
} | null;

type CashRegisterHistoryItem = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  initialCash: number;
  totalCash: number;
  totalCard: number;
  totalSales: number;
  realCash: number | null;
  difference: number | null;
  notes?: string | null;
  openedBy?: {
    name: string;
  };
  closedBy?: {
    name: string;
  } | null;
};

export default function CashRegisterPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState<CurrentCashRegister>(null);
  const [history, setHistory] = useState<CashRegisterHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAmount, setOpenAmount] = useState("");
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [realCash, setRealCash] = useState("");
  const [closingSummary, setClosingSummary] = useState<CashRegisterHistoryItem | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<CashRegisterHistoryItem | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [nextCurrent, nextHistory] = await Promise.all([
        api.get<CurrentCashRegister>("/cash-register/current"),
        api.get<CashRegisterHistoryItem[]>("/cash-register/history")
      ]);

      setCurrent(nextCurrent);
      setHistory(nextHistory);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudo cargar la caja";
      setError(message);
      showToast({ type: "error", title: "Caja", message });
    } finally {
      setLoading(false);
    }
  }

  const closeDifference = useMemo(() => {
    if (!current) {
      return null;
    }

    const counted = Number(realCash);
    if (!Number.isFinite(counted)) {
      return null;
    }

    return Number((counted - current.expectedCash).toFixed(2));
  }, [current, realCash]);

  const turnTotals = useMemo(() => {
    if (!current) {
      return null;
    }

    return {
      billsCount: current.bills.length,
      totalItems: current.bills.reduce((sum, bill) => sum + bill.items, 0)
    };
  }, [current]);

  async function openCashRegister() {
    const initialCash = Number(openAmount);

    if (!Number.isFinite(initialCash) || initialCash < 0) {
      const message = "Introduce un importe inicial valido";
      setError(message);
      showToast({ type: "warning", title: "Caja", message });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.post("/cash-register/open", { initialCash });
      setOpenAmount("");
      showToast({ type: "success", title: "Caja", message: "Caja abierta correctamente" });
      await loadData();
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : "No se pudo abrir la caja";
      setError(message);
      showToast({ type: "error", title: "Caja", message });
    } finally {
      setSaving(false);
    }
  }

  async function closeCashRegister() {
    if (!current) {
      return;
    }

    const countedCash = Number(realCash);

    if (!Number.isFinite(countedCash) || countedCash < 0) {
      const message = "Introduce el efectivo real contado";
      setError(message);
      showToast({ type: "warning", title: "Caja", message });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await api.post<CashRegisterHistoryItem>("/cash-register/close", {
        realCash: countedCash,
        notes: closeNotes.trim() || null
      });

      setClosingSummary(result);
      setCloseModalOpen(false);
      setCloseNotes("");
      setRealCash("");
      showToast({ type: "success", title: "Caja", message: "Caja cerrada correctamente" });
      await loadData();
    } catch (closeError) {
      const message = closeError instanceof Error ? closeError.message : "No se pudo cerrar la caja";
      setError(message);
      showToast({ type: "error", title: "Caja", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Caja del dia</h1>
        <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
          Controla el turno actual, el efectivo esperado y el historial de cierres.
        </p>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="surface-card p-6 text-sm text-[var(--color-text-muted)]">Cargando caja...</div>
      ) : !current ? (
        <section className="flex justify-center">
          <div className="surface-card w-full max-w-xl p-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <CashRegisterIcon />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-[var(--color-text)]">
              La caja no esta abierta
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Abre la caja para empezar a registrar ventas
            </p>

            <div className="mx-auto mt-6 max-w-sm text-left">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Efectivo inicial en caja
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-text-muted)]">
                    €
                  </span>
                  <input
                    className="field-input pl-10"
                    inputMode="decimal"
                    onChange={(event) => setOpenAmount(event.target.value.replace(",", "."))}
                    placeholder="0.00"
                    value={openAmount}
                  />
                </div>
              </label>
            </div>

            <button
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition-all duration-200 hover:bg-emerald-700 disabled:opacity-60"
              disabled={saving}
              onClick={() => void openCashRegister()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Abriendo" /> : "Abrir caja"}
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-800">
              Caja abierta desde las {formatTime(current.openedAt)}
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Abierta por {current.openedBy?.name ?? "-"}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Efectivo inicial" value={formatCurrency(current.initialCash)} />
            <MetricCard label="Ventas en efectivo" value={formatCurrency(current.totalCash)} />
            <MetricCard label="Ventas con tarjeta" value={formatCurrency(current.totalCard)} />
            <MetricCard label="Total ventas" value={formatCurrency(current.totalSales)} />
          </div>

          <section className="surface-card p-5 md:p-6">
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              Efectivo esperado en caja
            </p>
            <p className="mono mt-3 text-4xl font-bold text-[var(--color-text)]">
              {formatCurrency(current.expectedCash)}
            </p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Inicial + ventas en efectivo
            </p>
          </section>

          <section className="surface-card p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Cuentas del turno</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {turnTotals?.billsCount ?? 0} cuentas · {turnTotals?.totalItems ?? 0} items
                </p>
              </div>
            </div>

            {current.bills.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Todavia no hay cuentas cobradas en este turno.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
                <div className="hidden grid-cols-[0.7fr_1fr_0.6fr_0.8fr_0.8fr_1fr] gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] md:grid">
                  <span>Hora</span>
                  <span>Mesa</span>
                  <span>Items</span>
                  <span>Total</span>
                  <span>Metodo</span>
                  <span>Camarero</span>
                </div>

                <div className="max-h-[28rem] divide-y divide-[var(--color-border)] overflow-y-auto">
                  {current.bills.map((bill) => (
                    <div key={bill.id}>
                      <div className="space-y-2 px-4 py-4 md:hidden">
                        <div className="flex items-center justify-between gap-3">
                          <span className="mono text-sm font-semibold text-[var(--color-text)]">
                            {formatTime(bill.paidAt)}
                          </span>
                          <span className="mono text-sm font-semibold text-[var(--color-text)]">
                            {formatCurrency(bill.total)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{bill.tableLabel}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {bill.waiterName} · {bill.items} items · {formatPaymentMethod(bill.paymentMethod)}
                        </p>
                      </div>

                      <div className="hidden grid-cols-[0.7fr_1fr_0.6fr_0.8fr_0.8fr_1fr] items-center gap-3 px-4 py-4 text-sm md:grid">
                        <span className="mono font-semibold text-[var(--color-text)]">
                          {formatTime(bill.paidAt)}
                        </span>
                        <span className="text-[var(--color-text)]">{bill.tableLabel}</span>
                        <span className="text-[var(--color-text-muted)]">{bill.items}</span>
                        <span className="mono font-semibold text-[var(--color-text)]">
                          {formatCurrency(bill.total)}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          {formatPaymentMethod(bill.paymentMethod)}
                        </span>
                        <span className="text-[var(--color-text-muted)]">{bill.waiterName}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4 text-sm md:grid-cols-[1fr_0.8fr_0.8fr]">
                  <p className="font-medium text-[var(--color-text)]">
                    {current.bills.length} cuentas
                  </p>
                  <p className="text-[var(--color-text-muted)]">
                    Efectivo {formatCurrency(current.totalCash)}
                  </p>
                  <p className="mono font-semibold text-[var(--color-text)]">
                    Total {formatCurrency(current.totalSales)}
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <button
              className="rounded-xl bg-[var(--color-danger)] px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:opacity-90"
              onClick={() => setCloseModalOpen(true)}
              type="button"
            >
              CERRAR CAJA
            </button>
          </div>
        </section>
      )}

      {closingSummary ? (
        <section className="surface-card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Resumen del cierre</h2>
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => window.print()} type="button">
              Imprimir / Guardar
            </button>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[#fffaf1] p-5 font-mono text-sm text-[#1f1f1f]">
            <p className="text-center text-lg font-bold">DEJA VU</p>
            <p className="mt-1 text-center">CIERRE DE CAJA</p>
            <p className="mt-4">Apertura: {formatDateTime(closingSummary.openedAt)}</p>
            <p>Cierre: {closingSummary.closedAt ? formatDateTime(closingSummary.closedAt) : "-"}</p>
            <p>Abierta por: {closingSummary.openedBy?.name ?? "-"}</p>
            <p>Cerrada por: {closingSummary.closedBy?.name ?? "-"}</p>
            <p>--------------------------------</p>
            <p>Inicial: {formatCurrency(closingSummary.initialCash)}</p>
            <p>Efectivo: {formatCurrency(closingSummary.totalCash)}</p>
            <p>Tarjeta: {formatCurrency(closingSummary.totalCard)}</p>
            <p>Total ventas: {formatCurrency(closingSummary.totalSales)}</p>
            <p>Efectivo real: {formatCurrency(closingSummary.realCash ?? 0)}</p>
            <p>Diferencia: {formatCurrency(closingSummary.difference ?? 0)}</p>
            {closingSummary.notes ? <p>Notas: {closingSummary.notes}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="surface-card p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Historial de cajas</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Ultimos 30 cierres</p>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No hay cierres registrados.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <div className="hidden grid-cols-[1fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] md:grid">
              <span>Fecha</span>
              <span>Abierta</span>
              <span>Cerrada</span>
              <span>Duracion</span>
              <span>Total ventas</span>
              <span>Descuadre</span>
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              {history.map((item) => (
                <button
                  className="block w-full text-left transition-colors duration-200 hover:bg-[var(--color-surface-muted)]"
                  key={item.id}
                  onClick={() => setSelectedHistory(item)}
                  type="button"
                >
                  <div className="space-y-2 px-4 py-4 md:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[var(--color-text)]">
                        {item.closedAt ? formatDate(item.closedAt) : formatDate(item.openedAt)}
                      </span>
                      <span className={`text-sm font-semibold ${getDifferenceClass(item.difference)}`}>
                        {formatSignedCurrency(item.difference)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatTime(item.openedAt)} - {item.closedAt ? formatTime(item.closedAt) : "-"} · {formatDuration(item.openedAt, item.closedAt)}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Ventas {formatCurrency(item.totalSales)}
                    </p>
                  </div>

                  <div className="hidden grid-cols-[1fr_0.9fr_0.9fr_0.8fr_0.8fr_0.8fr] items-center gap-3 px-4 py-4 text-sm md:grid">
                    <span className="text-[var(--color-text)]">
                      {item.closedAt ? formatDate(item.closedAt) : formatDate(item.openedAt)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{formatTime(item.openedAt)}</span>
                    <span className="text-[var(--color-text-muted)]">{item.closedAt ? formatTime(item.closedAt) : "-"}</span>
                    <span className="text-[var(--color-text-muted)]">{formatDuration(item.openedAt, item.closedAt)}</span>
                    <span className="mono font-semibold text-[var(--color-text)]">{formatCurrency(item.totalSales)}</span>
                    <span className={`font-semibold ${getDifferenceClass(item.difference)}`}>
                      {formatSignedCurrency(item.difference)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {closeModalOpen && current ? (
        <ModalCard onClose={() => setCloseModalOpen(false)} title="Cerrar caja">
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm">
              <SummaryRow label="Efectivo inicial" value={formatCurrency(current.initialCash)} />
              <SummaryRow label="Ventas efectivo" value={formatCurrency(current.totalCash)} />
              <SummaryRow label="Ventas tarjeta" value={formatCurrency(current.totalCard)} />
              <SummaryRow label="Total ventas" value={formatCurrency(current.totalSales)} />
              <SummaryRow label="Efectivo esperado" value={formatCurrency(current.expectedCash)} />
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                Efectivo real contado
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-text-muted)]">
                  €
                </span>
                <input
                  className="field-input pl-10"
                  inputMode="decimal"
                  onChange={(event) => setRealCash(event.target.value.replace(",", "."))}
                  placeholder="0.00"
                  value={realCash}
                />
              </div>
            </label>

            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${getDifferencePanelClass(closeDifference)}`}>
              {closeDifference === null
                ? "Introduce el efectivo real para calcular el descuadre"
                : closeDifference === 0
                  ? "Cuadra"
                  : `Descuadre: ${formatSignedCurrency(closeDifference)}`}
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Notas</span>
              <textarea
                className="field-input min-h-28"
                onChange={(event) => setCloseNotes(event.target.value)}
                placeholder="Opcional, para explicar descuadres"
                value={closeNotes}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setCloseModalOpen(false)} type="button">
              Cancelar
            </button>
            <button
              className="rounded-xl bg-[var(--color-danger)] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
              disabled={saving}
              onClick={() => void closeCashRegister()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Confirmando" /> : "Confirmar cierre"}
            </button>
          </div>
        </ModalCard>
      ) : null}

      {selectedHistory ? (
        <ModalCard onClose={() => setSelectedHistory(null)} title="Detalle del cierre">
          <div className="space-y-3 text-sm">
            <SummaryRow label="Fecha" value={selectedHistory.closedAt ? formatDateTime(selectedHistory.closedAt) : formatDateTime(selectedHistory.openedAt)} />
            <SummaryRow label="Abierta por" value={selectedHistory.openedBy?.name ?? "-"} />
            <SummaryRow label="Cerrada por" value={selectedHistory.closedBy?.name ?? "-"} />
            <SummaryRow label="Duracion" value={formatDuration(selectedHistory.openedAt, selectedHistory.closedAt)} />
            <SummaryRow label="Total ventas" value={formatCurrency(selectedHistory.totalSales)} />
            <SummaryRow label="Efectivo real" value={formatCurrency(selectedHistory.realCash ?? 0)} />
            <SummaryRow label="Descuadre" value={formatSignedCurrency(selectedHistory.difference)} />
            {selectedHistory.notes ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  Notas
                </p>
                <p className="mt-2 text-[var(--color-text)]">{selectedHistory.notes}</p>
              </div>
            ) : null}
          </div>
        </ModalCard>
      ) : null}
    </section>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="surface-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        {props.label}
      </p>
      <p className="mt-3 text-2xl font-bold text-[var(--color-text)]">{props.value}</p>
    </article>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-text-muted)]">{props.label}</span>
      <span className="font-medium text-[var(--color-text)]">{props.value}</span>
    </div>
  );
}

function ModalCard(props: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{props.title}</h2>
          <button className="btn-ghost min-h-11 px-3 py-2 text-sm" onClick={props.onClose} type="button">
            Cerrar
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

function CashRegisterIcon() {
  return (
    <svg aria-hidden="true" className="h-10 w-10" fill="none" viewBox="0 0 24 24">
      <path d="M7 5h10v4H7zm-1 4h12a2 2 0 0 1 2 2v7H4v-7a2 2 0 0 1 2-2Zm3 4h2m4 0h2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function getDifferenceClass(value: number | null) {
  if (value === null || value === 0) {
    return "text-emerald-600";
  }

  return value < 0 ? "text-red-600" : "text-amber-700";
}

function getDifferencePanelClass(value: number | null) {
  if (value === null) {
    return "border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  }

  if (value === 0) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border border-red-200 bg-red-50 text-red-700";
}

function formatSignedCurrency(value: number | null | undefined) {
  const safeValue = value ?? 0;
  const sign = safeValue > 0 ? "+" : "";
  return `${sign}${formatCurrency(safeValue)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(openedAt: string, closedAt: string | null) {
  if (!closedAt) {
    return "-";
  }

  const diffMs = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatPaymentMethod(value: "CASH" | "CARD" | "MIXED") {
  if (value === "CASH") {
    return "Efectivo";
  }

  if (value === "CARD") {
    return "Tarjeta";
  }

  return "Mixto";
}
