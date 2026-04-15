import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Skeleton from "../../components/Skeleton";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "prevMonth" | "custom";
type SortOrder = "asc" | "desc";
type WaiterSortColumn = "waiterName" | "orders" | "totalSales" | "averageTicket" | "tablesServed";

type ReportsResponse = {
  range: {
    from: string;
    to: string;
    granularity: "hour" | "day";
  };
  salesOverTime: Array<{ date: string; label: string; total: number }>;
  salesByCategory: Array<{ categoryName: string; total: number; quantity: number }>;
  topProducts: Array<{
    productName: string;
    categoryName: string;
    total: number;
    quantity: number;
  }>;
  waiterPerformance: Array<{
    waiterName: string;
    orders: number;
    totalSales: number;
    averageTicket: number;
    tablesServed: number;
  }>;
  hourlyHeatmap: Array<{ dayOfWeek: number; hour: number; total: number }>;
  paymentMethods: { cash: number; card: number; mixed: number };
};

const categoryColors = ["#E85D2A", "#F59E0B", "#2563EB", "#16A34A", "#A16207", "#7C3AED"];
const dayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const hours = Array.from({ length: 14 }, (_, index) => index + 10);

export default function ReportsPage() {
  const { showToast } = useToast();
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [stats, setStats] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<WaiterSortColumn>("totalSales");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (preset === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "7d") {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "30d") {
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "month") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "prevMonth") {
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
    } else {
      return {
        from: fromDate ? new Date(`${fromDate}T00:00:00`) : null,
        to: toDate ? new Date(`${toDate}T23:59:59`) : null
      };
    }

    return { from: start, to: end };
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      if (!range.from || !range.to) {
        setStats(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const params = new URLSearchParams({
          from: range.from.toISOString(),
          to: range.to.toISOString()
        });
        const response = await api.get<ReportsResponse>(`/stats/reports?${params.toString()}`);

        if (!cancelled) {
          setStats(response);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "Informes",
            message: error instanceof Error ? error.message : "No se pudieron cargar los informes"
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, showToast]);

  const maxCategoryTotal = useMemo(
    () => Math.max(...(stats?.salesByCategory.map((item) => item.total) ?? [0])),
    [stats]
  );

  const maxWaiterSales = useMemo(
    () => Math.max(...(stats?.waiterPerformance.map((item) => item.totalSales) ?? [0])),
    [stats]
  );

  const heatmapMax = useMemo(
    () => Math.max(...(stats?.hourlyHeatmap.map((item) => item.total) ?? [0])),
    [stats]
  );

  const sortedWaiters = useMemo(() => {
    if (!stats) {
      return [];
    }

    const rows = [...stats.waiterPerformance];
    rows.sort((left, right) => {
      const multiplier = sortOrder === "asc" ? 1 : -1;

      if (sortColumn === "waiterName") {
        return left.waiterName.localeCompare(right.waiterName) * multiplier;
      }

      return (left[sortColumn] - right[sortColumn]) * multiplier;
    });

    return rows;
  }, [sortColumn, sortOrder, stats]);

  const paymentData = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      { name: "Efectivo", value: stats.paymentMethods.cash, color: "#16A34A" },
      { name: "Tarjeta", value: stats.paymentMethods.card, color: "#2563EB" },
      { name: "Mixto", value: stats.paymentMethods.mixed, color: "#F59E0B" }
    ].filter((item) => item.value > 0);
  }, [stats]);

  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Informes de ventas</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Analiza ventas, categorias, productos, rendimiento de equipo y horas punta.
          </p>
        </div>

        <div className="surface-card p-4 md:p-5">
          <div className="flex flex-wrap gap-2">
            {periodButtons.map((button) => (
              <button
                key={button.key}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  preset === button.key
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                }`}
                onClick={() => setPreset(button.key)}
                type="button"
              >
                {button.label}
              </button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--color-text-muted)]">Desde</span>
                <input
                  className="field-input"
                  onChange={(event) => setFromDate(event.target.value)}
                  type="date"
                  value={fromDate}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--color-text-muted)]">Hasta</span>
                <input
                  className="field-input"
                  onChange={(event) => setToDate(event.target.value)}
                  type="date"
                  value={toDate}
                />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      {loading || !stats ? (
        <div className="space-y-6">
          <div className="surface-card p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="mt-6 h-80 w-full" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="surface-card p-6">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="mt-6 h-72 w-full" />
            </div>
            <div className="surface-card p-6">
              <Skeleton className="h-6 w-40" />
              <div className="mt-6 space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton className="h-12 w-full" key={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="surface-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Evolucion de ventas</h2>
              <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                {stats.range.granularity === "hour" ? "Por horas" : "Por dias"}
              </span>
            </div>
            <div className="mt-6 h-80">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={stats.salesOverTime}>
                  <defs>
                    <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#E85D2A" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#E85D2A" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ece8e0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#7c746c" />
                  <YAxis tickLine={false} axisLine={false} stroke="#7c746c" tickFormatter={(value) => `${value}€`} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e2dc",
                      boxShadow: "0 8px 22px rgba(0,0,0,0.08)"
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { date?: string; label?: string } | undefined;
                      return row?.date ? formatDateLabel(row.date, stats.range.granularity) : row?.label ?? "";
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#E85D2A"
                    fill="url(#salesArea)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="surface-card p-5 md:p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Ventas por categoria</h2>
              <div className="mt-6 h-80">
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie
                      data={stats.salesByCategory}
                      dataKey="total"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                    >
                      {stats.salesByCategory.map((entry, index) => (
                        <Cell
                          fill={categoryColors[index % categoryColors.length]}
                          key={entry.categoryName}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-y-3">
                {stats.salesByCategory.map((category, index) => {
                  const totalSum = stats.salesByCategory.reduce((sum, item) => sum + item.total, 0);
                  const percentage = totalSum > 0 ? (category.total / totalSum) * 100 : 0;

                  return (
                    <div className="flex items-center justify-between gap-3 text-sm" key={category.categoryName}>
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: categoryColors[index % categoryColors.length] }}
                        />
                        <span className="font-medium text-[var(--color-text)]">{category.categoryName}</span>
                      </div>
                      <span className="text-[var(--color-text-muted)]">
                        {formatCurrency(category.total)} · {percentage.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="surface-card p-5 md:p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Ranking de categorias</h2>
              <div className="mt-6 space-y-4">
                {stats.salesByCategory.map((category, index) => (
                  <div key={category.categoryName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {index + 1}. {category.categoryName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {category.quantity} uds · {formatCurrency(category.total)}
                        </p>
                      </div>
                      <span className="mono text-sm text-[var(--color-text)]">
                        {formatCurrency(category.total)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{
                          width: `${maxCategoryTotal > 0 ? (category.total / maxCategoryTotal) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="surface-card p-5 md:p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Top productos</h2>
            <div className="mt-6 h-[420px]">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 28 }}>
                  <defs>
                    <linearGradient id="productBars" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#F59E0B" />
                      <stop offset="100%" stopColor="#E85D2A" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ece8e0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} stroke="#7c746c" />
                  <YAxis
                    type="category"
                    dataKey="productName"
                    width={140}
                    tickLine={false}
                    axisLine={false}
                    stroke="#7c746c"
                  />
                  <Tooltip
                    formatter={(value, key, payload) => {
                      if (key === "total") {
                        return [formatCurrency(Number(value)), "Total"];
                      }

                      return [Number(value), "Unidades"];
                    }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload
                        ? `${payload[0].payload.productName} · ${payload[0].payload.categoryName}`
                        : ""
                    }
                  />
                  <Bar dataKey="quantity" fill="url(#productBars)" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Analisis por camareros</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--color-surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  <tr>
                    {waiterColumns.map((column) => (
                      <th className="px-5 py-3" key={column.key}>
                        <button
                          className="inline-flex items-center gap-2"
                          onClick={() => {
                            if (sortColumn === column.key) {
                              setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
                            } else {
                              setSortColumn(column.key);
                              setSortOrder(column.key === "waiterName" ? "asc" : "desc");
                            }
                          }}
                          type="button"
                        >
                          <span>{column.label}</span>
                          <span className={`text-[10px] ${sortColumn === column.key ? "opacity-100" : "opacity-35"}`}>
                            {sortColumn === column.key && sortOrder === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {sortedWaiters.map((waiter) => (
                    <tr key={waiter.waiterName}>
                      <td className="px-5 py-4 font-medium text-[var(--color-text)]">{waiter.waiterName}</td>
                      <td className="px-5 py-4 text-[var(--color-text-muted)]">{waiter.orders}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)]"
                              style={{
                                width: `${maxWaiterSales > 0 ? (waiter.totalSales / maxWaiterSales) * 100 : 0}%`
                              }}
                            />
                          </div>
                          <span className="mono min-w-24 text-right text-[var(--color-text)]">
                            {formatCurrency(waiter.totalSales)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 mono text-[var(--color-text)]">{formatCurrency(waiter.averageTicket)}</td>
                      <td className="px-5 py-4 text-[var(--color-text-muted)]">{waiter.tablesServed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
            <div className="surface-card p-5 md:p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Horas punta</h2>
              <div className="mt-6 overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
                    <div />
                    {dayLabels.map((day) => (
                      <div
                        className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]"
                        key={day}
                      >
                        {day}
                      </div>
                    ))}
                    {hours.map((hour) => (
                      <>
                        <div
                          className="flex items-center text-xs font-semibold text-[var(--color-text-muted)]"
                          key={`label-${hour}`}
                        >
                          {String(hour).padStart(2, "0")}:00
                        </div>
                        {dayLabels.map((_, dayIndex) => {
                          const cell = stats.hourlyHeatmap.find(
                            (item) => item.dayOfWeek === dayIndex && item.hour === hour
                          );
                          const value = cell?.total ?? 0;
                          const opacity = heatmapMax > 0 ? Math.max(value / heatmapMax, 0.08) : 0.08;

                          return (
                            <div
                              className="flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)]"
                              key={`${dayIndex}-${hour}`}
                              style={{
                                backgroundColor: `rgba(232, 93, 42, ${opacity})`
                              }}
                              title={`${dayLabels[dayIndex]} ${String(hour).padStart(2, "0")}:00 · ${formatCurrency(value)}`}
                            >
                              {value > 0 ? Math.round(value) : "-"}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-card p-5 md:p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Metodos de pago</h2>
              <div className="mt-6 h-64">
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" innerRadius={52} outerRadius={88}>
                      {paymentData.map((entry) => (
                        <Cell fill={entry.color} key={entry.name} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {paymentData.map((item) => (
                  <div className="flex items-center justify-between text-sm" key={item.name}>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-[var(--color-text)]">{item.name}</span>
                    </div>
                    <span className="mono text-[var(--color-text-muted)]">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

const periodButtons: Array<{ key: PeriodPreset; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mes" },
  { key: "prevMonth", label: "Mes anterior" },
  { key: "custom", label: "Rango custom" }
];

const waiterColumns: Array<{ key: WaiterSortColumn; label: string }> = [
  { key: "waiterName", label: "Camarero" },
  { key: "orders", label: "Pedidos" },
  { key: "totalSales", label: "Total facturado" },
  { key: "averageTicket", label: "Ticket medio" },
  { key: "tablesServed", label: "Mesas atendidas" }
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateLabel(value: string, granularity: "hour" | "day") {
  const date = new Date(value);

  if (granularity === "hour") {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
