import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Skeleton from "../components/Skeleton";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";

type BillPreview = {
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  tableNumber: number;
};

type CreatedBill = {
  id: string;
  paymentMethod: "CASH" | "CARD" | "MIXED";
  paidAt: string;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  cashAmount: number | string | null;
  cardAmount: number | string | null;
  table: { id: string; number: number; name: string | null };
  orders: Array<{ id: string; items: Array<{ id: string; quantity: number; unitPrice: number | string; product: { name: string } }> }>;
};

type PaymentMethod = "CASH" | "CARD" | "MIXED";

const paymentMethods: Array<{ key: PaymentMethod; label: string; description: string }> = [
  { key: "CASH", label: "Efectivo", description: "Pago en metálico" },
  { key: "CARD", label: "Tarjeta", description: "Pago completo con tarjeta" },
  { key: "MIXED", label: "Mixto", description: "Combina efectivo y tarjeta" }
];

export default function BillPage() {
  const { tableId = "" } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBill, setCreatedBill] = useState<CreatedBill | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      try {
        const nextPreview = await api.get<BillPreview>(`/bills/table/${tableId}/preview`);
        if (!cancelled) {
          setPreview(nextPreview);
          setError(null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "No se pudo cargar la cuenta";
        if (!cancelled) {
          setError(message);
          showToast({ type: "error", title: "Cuenta", message });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (tableId) void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [showToast, tableId]);

  const change = useMemo(() => {
    if (!preview || paymentMethod !== "CASH") return 0;
    return Math.max(0, toNumber(cashAmount) - preview.total);
  }, [cashAmount, paymentMethod, preview]);

  const mixedTotal = useMemo(() => toNumber(cashAmount) + toNumber(cardAmount), [cashAmount, cardAmount]);

  const handleSubmit = async () => {
    if (!preview || !tableId) return;
    setSubmitting(true);
    setError(null);
    try {
      const bill = await api.post<CreatedBill>("/bills", {
        tableId,
        paymentMethod,
        cashAmount: paymentMethod === "CARD" ? undefined : toNumberOrUndefined(cashAmount),
        cardAmount:
          paymentMethod === "CARD"
            ? preview.total
            : paymentMethod === "CASH"
              ? undefined
              : toNumberOrUndefined(cardAmount)
      });
      setCreatedBill(bill);
      showToast({ type: "success", title: "Cobro", message: "Cuenta cobrada correctamente" });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo registrar el cobro";
      setError(message);
      showToast({ type: "error", title: "Cobro", message });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintTicket = async () => {
    if (!createdBill) return;
    setPrinting(true);
    try {
      await api.post(`/bills/${createdBill.id}/print`);
      showToast({ type: "success", title: "Ticket", message: "Ticket enviado a la impresora" });
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "No se pudo imprimir el ticket";
      showToast({ type: "error", title: "Ticket", message });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <section className="space-y-5 pb-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">
            {preview ? `Cuenta mesa ${preview.tableNumber}` : "Cuenta"}
          </h1>
        </div>

        <button
          aria-label="Volver al pedido"
          className="btn-secondary px-4 py-2.5 text-sm font-medium"
          onClick={() => navigate(`/order/${tableId}`)}
          type="button"
        >
          Volver
        </button>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-5">
          <div className="surface-card p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-5/6" />
            <Skeleton className="mt-6 h-24 w-full" />
          </div>
          <div className="surface-card p-5">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-4 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        </div>
      ) : createdBill ? (
        <section className="space-y-5">
          <div className="surface-card border-l-4 border-l-emerald-600 bg-emerald-50 p-5">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">Cobro completado</p>
            <h2 className="mono mt-2 text-3xl text-[var(--color-text)]">{formatCurrency(toNumber(createdBill.total))}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Mesa {createdBill.table.number} cerrada correctamente.
            </p>
          </div>

          <TicketCard bill={createdBill} />

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              aria-label="Imprimir ticket"
              className="btn-secondary px-5 py-4 text-sm font-medium"
              disabled={printing}
              onClick={handlePrintTicket}
              type="button"
            >
              {printing ? <Spinner className="h-5 w-5" label="Imprimiendo..." /> : "Imprimir ticket"}
            </button>

            <button
              aria-label="Cerrar mesa y volver"
              className="btn-primary px-5 py-4 text-sm font-medium"
              onClick={() => navigate("/tables")}
              type="button"
            >
              Cerrar mesa
            </button>
          </div>
        </section>
      ) : preview ? (
        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.95fr]">
          <div className="space-y-5">
            <section className="surface-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Resumen de cuenta</h2>
                <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                  Mesa {preview.tableNumber}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {preview.items.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--color-border)] pb-3 text-sm last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--color-text)]">
                        {item.name} x{item.quantity}
                      </p>
                      <p className="text-[var(--color-text-muted)]">
                        {formatCurrency(item.unitPrice)} / unidad
                      </p>
                    </div>
                    <span className="mono text-[var(--color-text)]">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-card-alt p-5">
              <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                <span>Subtotal</span>
                <span className="mono text-[var(--color-text)]">{formatCurrency(preview.subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                <span>IVA (10%)</span>
                <span className="mono text-[var(--color-text)]">{formatCurrency(preview.tax)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
                <span className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Total</span>
                <span className="mono text-3xl text-[var(--color-text)]">{formatCurrency(preview.total)}</span>
              </div>
            </section>
          </div>

          <section className="surface-card p-5">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Cobro</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Selecciona cómo paga la mesa y confirma el cierre.</p>

            <div className="mt-4 grid gap-2">
              {paymentMethods.map((method) => (
                <button
                  key={method.key}
                  aria-label={`Cobrar con ${method.label}`}
                  className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                    paymentMethod === method.key
                      ? "border-[var(--color-primary)] bg-orange-50"
                      : "border-[var(--color-border)] bg-white"
                  }`}
                  onClick={() => setPaymentMethod(method.key)}
                  type="button"
                >
                  <p className={`font-medium ${paymentMethod === method.key ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
                    {method.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{method.description}</p>
                </button>
              ))}
            </div>

            {paymentMethod === "CASH" ? (
              <div className="mt-5 space-y-3">
                <AmountInput label="Cantidad recibida" onChange={setCashAmount} value={cashAmount} />
                <div className="surface-card-alt px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)]">Cambio</span>
                  <p className="mono mt-1 text-xl text-[var(--color-text)]">{formatCurrency(change)}</p>
                </div>
              </div>
            ) : null}

            {paymentMethod === "MIXED" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <AmountInput label="Efectivo" onChange={setCashAmount} value={cashAmount} />
                <AmountInput label="Tarjeta" onChange={setCardAmount} value={cardAmount} />
                <div className="surface-card-alt sm:col-span-2 px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)]">Introducido</span>
                  <p className="mono mt-1 text-xl text-[var(--color-text)]">{formatCurrency(mixedTotal)}</p>
                </div>
              </div>
            ) : null}

            {paymentMethod === "CARD" ? (
              <div className="surface-card-alt mt-5 px-4 py-3 text-sm text-[var(--color-text-muted)]">
                Se cobrará el total completo por tarjeta.
              </div>
            ) : null}

            <button
              aria-label="Cobrar la cuenta"
              className="btn-primary mt-5 w-full px-5 py-4 text-base font-medium disabled:opacity-50"
              disabled={submitting}
              onClick={handleSubmit}
              type="button"
            >
              {submitting ? <Spinner className="h-5 w-5" label="Cobrando..." /> : "Cobrar"}
            </button>
          </section>
        </section>
      ) : null}
    </section>
  );
}

function AmountInput(props: { label: string; value: string; onChange: (value: string) => void }) {
  const { label, value, onChange } = props;
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">{label}</span>
      <input
        className="field-input text-lg"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value.replace(",", "."))}
        placeholder="0.00"
        value={value}
      />
    </label>
  );
}

function TicketCard(props: { bill: CreatedBill }) {
  const { bill } = props;
  return (
    <section className="surface-card p-5">
      <div className="mx-auto max-w-sm border border-dashed border-stone-300 bg-[#fffaf1] px-5 py-6 font-mono text-sm text-zinc-900 shadow-inner">
        <div className="text-center">
          <p className="text-lg font-bold">DEJA VU</p>
          <p>Ticket simplificado</p>
          <p>{new Date(bill.paidAt).toLocaleString("es-ES")}</p>
          <p>Mesa {bill.table.number}</p>
          <p>------------------------------</p>
        </div>

        <div className="mt-4 space-y-2">
          {buildTicketLines(bill).map((line, index) => (
            <div className="flex justify-between gap-3" key={`${line.name}-${index}`}>
              <span className="truncate pr-2">
                {line.quantity}x {line.name}
              </span>
              <span>{formatCurrency(line.total)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-dashed border-stone-300 pt-4">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(toNumber(bill.subtotal))}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA</span>
            <span>{formatCurrency(toNumber(bill.tax))}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span>{formatCurrency(toNumber(bill.total))}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function buildTicketLines(bill: CreatedBill) {
  const grouped = new Map<string, { name: string; quantity: number; total: number }>();
  for (const order of bill.orders) {
    for (const item of order.items) {
      const unitPrice = toNumber(item.unitPrice);
      const key = `${item.product.name}:${unitPrice}`;
      const current = grouped.get(key);
      if (current) {
        current.quantity += item.quantity;
        current.total += item.quantity * unitPrice;
      } else {
        grouped.set(key, { name: item.product.name, quantity: item.quantity, total: item.quantity * unitPrice });
      }
    }
  }
  return Array.from(grouped.values());
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function toNumberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
