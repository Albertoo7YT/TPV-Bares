import { useEffect, useMemo, useState } from "react";
import Skeleton from "../../components/Skeleton";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type PaymentMethod = "CASH" | "CARD" | "MIXED";
type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";
type SortColumn =
  | "number"
  | "paidAt"
  | "tableLabel"
  | "waiter"
  | "items"
  | "subtotal"
  | "tax"
  | "total"
  | "paymentMethod";
type SortOrder = "asc" | "desc";

type UserOption = {
  id: string;
  name: string;
  role: "ADMIN" | "WAITER" | "KITCHEN";
};

type BillRow = {
  id: string;
  number: number;
  paidAt: string;
  tableLabel: string;
  tableNumber: number;
  waiter: { id: string; name: string } | null;
  items: number;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  cardAmount: number;
};

type BillsListResponse = {
  data: BillRow[];
  total: number;
  page: number;
  pages: number;
  summary: {
    totalAmount: number;
    cashAmount: number;
    cardAmount: number;
    count: number;
    averageTicket: number;
  };
};

type BillDetail = {
  id: string;
  paidAt: string;
  createdAt: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount: number | null;
  cardAmount: number | null;
  table: {
    id: string;
    number: number;
    name: string | null;
  };
  waiter: {
    id: string;
    name: string;
    role: "ADMIN" | "WAITER" | "KITCHEN";
  } | null;
  itemsCount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

const pageSize = 25;

export default function BillsHistoryPage() {
  const { showToast } = useToast();
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [waiterId, setWaiterId] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn>("paidAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [data, setData] = useState<BillsListResponse | null>(null);
  const [waiters, setWaiters] = useState<UserOption[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (datePreset === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === "week") {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === "month") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === "custom") {
      return {
        from: fromDate ? new Date(`${fromDate}T00:00:00`) : null,
        to: toDate ? new Date(`${toDate}T23:59:59`) : null
      };
    }

    return { from: start, to: end };
  }, [datePreset, fromDate, toDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadWaiters() {
      try {
        const users = await api.get<UserOption[]>("/users");

        if (!cancelled) {
          setWaiters(users.filter((user) => user.role === "WAITER"));
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Usuarios",
            message: error instanceof Error ? error.message : "No se pudieron cargar los camareros"
          });
        }
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    }

    void loadWaiters();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadBills() {
      setLoading(true);

      try {
        const params = new URLSearchParams();

        if (dateRange.from) {
          params.set("from", dateRange.from.toISOString());
        }

        if (dateRange.to) {
          params.set("to", dateRange.to.toISOString());
        }

        if (paymentMethod !== "ALL") {
          params.set("paymentMethod", paymentMethod);
        }

        if (waiterId !== "ALL") {
          params.set("waiterId", waiterId);
        }

        params.set("page", String(page));
        params.set("limit", String(pageSize));
        params.set(
          "sortBy",
          sortColumn === "paidAt" || sortColumn === "subtotal" || sortColumn === "tax" || sortColumn === "total" || sortColumn === "paymentMethod"
            ? sortColumn
            : "paidAt"
        );
        params.set("sortOrder", sortOrder);

        const nextData = await api.get<BillsListResponse>(`/bills?${params.toString()}`);

        if (!cancelled) {
          setData(nextData);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Historial de cuentas",
            message: error instanceof Error ? error.message : "No se pudo cargar el historial"
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBills();

    return () => {
      cancelled = true;
    };
  }, [dateRange.from, dateRange.to, page, paymentMethod, showToast, sortColumn, sortOrder, waiterId]);

  useEffect(() => {
    if (!selectedBillId) {
      setSelectedBill(null);
      return;
    }

    let cancelled = false;

    async function loadBillDetail() {
      setDetailLoading(true);

      try {
        const bill = await api.get<BillDetail>(`/bills/${selectedBillId}`);

        if (!cancelled) {
          setSelectedBill(bill);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Cuenta",
            message: error instanceof Error ? error.message : "No se pudo cargar el detalle"
          });
          setSelectedBillId(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadBillDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedBillId, showToast]);

  const sortedRows = useMemo(() => {
    if (!data) {
      return [];
    }

    const rows = [...data.data];

    rows.sort((left, right) => {
      const multiplier = sortOrder === "asc" ? 1 : -1;

      if (sortColumn === "number") {
        return (left.number - right.number) * multiplier;
      }

      if (sortColumn === "paidAt") {
        return (new Date(left.paidAt).getTime() - new Date(right.paidAt).getTime()) * multiplier;
      }

      if (sortColumn === "tableLabel") {
        return left.tableLabel.localeCompare(right.tableLabel) * multiplier;
      }

      if (sortColumn === "waiter") {
        return (left.waiter?.name ?? "").localeCompare(right.waiter?.name ?? "") * multiplier;
      }

      if (sortColumn === "items") {
        return (left.items - right.items) * multiplier;
      }

      if (sortColumn === "subtotal") {
        return (left.subtotal - right.subtotal) * multiplier;
      }

      if (sortColumn === "tax") {
        return (left.tax - right.tax) * multiplier;
      }

      if (sortColumn === "total") {
        return (left.total - right.total) * multiplier;
      }

      return left.paymentMethod.localeCompare(right.paymentMethod) * multiplier;
    });

    return rows;
  }, [data, sortColumn, sortOrder]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortOrder(column === "number" ? "asc" : "desc");
  };

  return (
    <section className="space-y-6 page-enter">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .bill-print-modal,
          .bill-print-modal * {
            visibility: visible;
          }
          .bill-print-modal {
            position: absolute;
            inset: 0;
            padding: 0;
            background: white;
          }
        }
      `}</style>

      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Historial de cuentas</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Revisa las cuentas cobradas, filtra por periodo y accede al detalle de cada ticket.
          </p>
        </div>

        <div className="surface-card p-4 md:p-5">
          <div className="grid gap-3 xl:grid-cols-[1.6fr_0.8fr_0.9fr]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
              {datePresets.map((preset) => (
                <button
                  key={preset.key}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                    datePreset === preset.key
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                  }`}
                  onClick={() => {
                    setDatePreset(preset.key);
                    setPage(1);
                  }}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <select
              className="field-input"
              onChange={(event) => {
                setPaymentMethod(event.target.value as PaymentMethod | "ALL");
                setPage(1);
              }}
              value={paymentMethod}
            >
              <option value="ALL">Todos los pagos</option>
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="MIXED">Mixto</option>
            </select>

            <select
              className="field-input"
              disabled={usersLoading}
              onChange={(event) => {
                setWaiterId(event.target.value);
                setPage(1);
              }}
              value={waiterId}
            >
              <option value="ALL">Todos los camareros</option>
              {waiters.map((waiter) => (
                <option key={waiter.id} value={waiter.id}>
                  {waiter.name}
                </option>
              ))}
            </select>
          </div>

          {datePreset === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--color-text-muted)]">Desde</span>
                <input
                  className="field-input"
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={fromDate}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--color-text-muted)]">Hasta</span>
                <input
                  className="field-input"
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={toDate}
                />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total cuentas" value={String(data?.summary.count ?? 0)} />
        <SummaryCard label="Total facturado" value={formatCurrency(data?.summary.totalAmount ?? 0)} highlight />
        <SummaryCard label="Efectivo" value={formatCurrency(data?.summary.cashAmount ?? 0)} />
        <SummaryCard label="Tarjeta" value={formatCurrency(data?.summary.cardAmount ?? 0)} />
        <SummaryCard label="Ticket medio" value={formatCurrency(data?.summary.averageTicket ?? 0)} />
      </div>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Cuentas</h2>
        </div>

        {loading ? (
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton className="h-12 w-full" key={index} />
            ))}
          </div>
        ) : !data || sortedRows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-base font-semibold text-[var(--color-text)]">No hay cuentas en este rango</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Ajusta los filtros de fecha, pago o camarero para ampliar la busqueda.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--color-surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  <tr>
                    <SortableHeader current={sortColumn} label="Nº" onSort={handleSort} order={sortOrder} value="number" />
                    <SortableHeader current={sortColumn} label="Fecha / Hora" onSort={handleSort} order={sortOrder} value="paidAt" />
                    <SortableHeader current={sortColumn} label="Mesa" onSort={handleSort} order={sortOrder} value="tableLabel" />
                    <SortableHeader current={sortColumn} label="Camarero" onSort={handleSort} order={sortOrder} value="waiter" />
                    <SortableHeader current={sortColumn} label="Items" onSort={handleSort} order={sortOrder} value="items" />
                    <SortableHeader current={sortColumn} label="Subtotal" onSort={handleSort} order={sortOrder} value="subtotal" />
                    <SortableHeader current={sortColumn} label="IVA" onSort={handleSort} order={sortOrder} value="tax" />
                    <SortableHeader current={sortColumn} label="Total" onSort={handleSort} order={sortOrder} value="total" />
                    <SortableHeader current={sortColumn} label="Pago" onSort={handleSort} order={sortOrder} value="paymentMethod" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {sortedRows.map((bill) => (
                    <tr
                      className="cursor-pointer transition-colors duration-200 hover:bg-[var(--color-surface-muted)]"
                      key={bill.id}
                      onClick={() => setSelectedBillId(bill.id)}
                    >
                      <td className="px-5 py-4 font-medium text-[var(--color-text)]">{bill.number}</td>
                      <td className="px-5 py-4 text-[var(--color-text)]">
                        <div className="space-y-0.5">
                          <p>{formatDateTime(bill.paidAt)}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{formatShortDate(bill.paidAt)}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[var(--color-text)]">{bill.tableLabel}</td>
                      <td className="px-5 py-4 text-[var(--color-text-muted)]">{bill.waiter?.name ?? "Sin camarero"}</td>
                      <td className="px-5 py-4 text-[var(--color-text-muted)]">{bill.items}</td>
                      <td className="px-5 py-4 mono text-[var(--color-text)]">{formatCurrency(bill.subtotal)}</td>
                      <td className="px-5 py-4 mono text-[var(--color-text)]">{formatCurrency(bill.tax)}</td>
                      <td className="px-5 py-4 mono font-semibold text-[var(--color-text)]">{formatCurrency(bill.total)}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--color-text)]">
                          <PaymentIcon method={bill.paymentMethod} />
                          {formatPaymentMethod(bill.paymentMethod)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--color-text-muted)]">
                Mostrando pagina {data.page} de {data.pages} · {data.total} cuentas
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary px-4 py-2 text-sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="btn-secondary px-4 py-2 text-sm"
                  disabled={data.page >= data.pages}
                  onClick={() => setPage((current) => Math.min(data.pages, current + 1))}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedBillId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bill-print-modal max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle de cuenta</h3>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {selectedBill ? `${selectedBill.table.name ?? `Mesa ${selectedBill.table.number}`}` : "Cargando..."}
                </p>
              </div>
              <button
                aria-label="Cerrar detalle de cuenta"
                className="btn-ghost px-3 py-2 text-sm"
                onClick={() => setSelectedBillId(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>

            {detailLoading || !selectedBill ? (
              <div className="space-y-3 px-5 py-5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <div className="max-h-[calc(90vh-76px)] overflow-y-auto px-5 py-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="surface-card-alt p-4">
                    <p className="text-sm text-[var(--color-text-muted)]">Fecha</p>
                    <p className="mt-1 font-semibold text-[var(--color-text)]">{formatFullDateTime(selectedBill.paidAt)}</p>
                  </div>
                  <div className="surface-card-alt p-4">
                    <p className="text-sm text-[var(--color-text-muted)]">Camarero</p>
                    <p className="mt-1 font-semibold text-[var(--color-text)]">{selectedBill.waiter?.name ?? "Sin asignar"}</p>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-[var(--color-surface-muted)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    <span>Item</span>
                    <span>Cantidad</span>
                    <span>P. unit.</span>
                    <span>Subtotal</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {selectedBill.items.map((item) => (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 text-sm" key={`${item.name}-${item.unitPrice}`}>
                        <span className="font-medium text-[var(--color-text)]">{item.name}</span>
                        <span className="mono text-[var(--color-text-muted)]">{item.quantity}</span>
                        <span className="mono text-[var(--color-text-muted)]">{formatCurrency(item.unitPrice)}</span>
                        <span className="mono font-medium text-[var(--color-text)]">{formatCurrency(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
                  <section className="surface-card p-5">
                    <div className="mx-auto max-w-sm border border-dashed border-[var(--color-border)] bg-[#fffdf9] px-5 py-6 font-mono text-sm text-zinc-900">
                      <div className="text-center">
                        <p className="text-lg font-bold">DEJA VU</p>
                        <p>{formatFullDateTime(selectedBill.paidAt)}</p>
                        <p>{selectedBill.table.name ?? `Mesa ${selectedBill.table.number}`}</p>
                        <p>------------------------------</p>
                      </div>

                      <div className="mt-4 space-y-2">
                        {selectedBill.items.map((item) => (
                          <div className="flex justify-between gap-3" key={`${item.name}-${item.unitPrice}`}>
                            <span className="truncate pr-2">
                              {item.quantity}x {item.name}
                            </span>
                            <span>{formatCurrency(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 space-y-1 border-t border-dashed border-[var(--color-border)] pt-4">
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span>{formatCurrency(selectedBill.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>IVA</span>
                          <span>{formatCurrency(selectedBill.tax)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>TOTAL</span>
                          <span>{formatCurrency(selectedBill.total)}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="surface-card p-5">
                    <div className="space-y-3 text-sm">
                      <DetailRow label="Metodo de pago" value={formatPaymentMethod(selectedBill.paymentMethod)} />
                      <DetailRow label="Subtotal" value={formatCurrency(selectedBill.subtotal)} />
                      <DetailRow label="IVA" value={formatCurrency(selectedBill.tax)} />
                      <DetailRow label="Total" value={formatCurrency(selectedBill.total)} />
                      {selectedBill.paymentMethod === "MIXED" ? (
                        <>
                          <DetailRow label="Efectivo" value={formatCurrency(selectedBill.cashAmount ?? 0)} />
                          <DetailRow label="Tarjeta" value={formatCurrency(selectedBill.cardAmount ?? 0)} />
                        </>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-2">
                      <button className="btn-secondary px-4 py-3 text-sm font-medium" onClick={() => window.print()} type="button">
                        Ver ticket
                      </button>
                      <button className="btn-primary px-4 py-3 text-sm font-medium" onClick={() => window.print()} type="button">
                        Imprimir
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <article className="surface-card p-5">
      <p className="text-sm text-[var(--color-text-muted)]">{props.label}</p>
      <p
        className={`mono mt-2 text-2xl font-bold ${
          props.highlight ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"
        }`}
      >
        {props.value}
      </p>
    </article>
  );
}

function SortableHeader(props: {
  label: string;
  value: SortColumn;
  current: SortColumn;
  order: SortOrder;
  onSort: (column: SortColumn) => void;
}) {
  const { label, value, current, order, onSort } = props;
  const isActive = current === value;

  return (
    <th className="px-5 py-3">
      <button
        className={`inline-flex items-center gap-2 transition-colors duration-200 ${
          isActive ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
        }`}
        onClick={() => onSort(value)}
        type="button"
      >
        <span>{label}</span>
        <span className={`text-[10px] ${isActive ? "opacity-100" : "opacity-35"}`}>
          {order === "asc" && isActive ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-text-muted)]">{props.label}</span>
      <span className="mono font-medium text-[var(--color-text)]">{props.value}</span>
    </div>
  );
}

function PaymentIcon(props: { method: PaymentMethod }) {
  if (props.method === "CASH") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M4 7h16v10H4zM8 12h8M7 9h.01M17 15h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (props.method === "CARD") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M4 7h16v10H4zM4 11h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M3 8h9v5H3zM12 11h9v5h-9zM7.5 13v3M16.5 8v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

const datePresets: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Esta semana" },
  { key: "month", label: "Este mes" },
  { key: "custom", label: "Rango" }
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function formatFullDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPaymentMethod(value: PaymentMethod) {
  if (value === "CASH") {
    return "Efectivo";
  }

  if (value === "CARD") {
    return "Tarjeta";
  }

  return "Mixto";
}
