import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Skeleton from "../../components/Skeleton";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type MetricComparison = {
  current: number;
  previous: number | null;
  changePercent: number | null;
};

type DashboardStatsResponse = {
  totalSales: MetricComparison;
  totalOrders: MetricComparison;
  averageTicket: MetricComparison;
  activeTables: MetricComparison;
  paymentBreakdown: {
    cash: { count: number; total: number };
    card: { count: number; total: number };
    mixed: { count: number; total: number };
  };
  salesByHour: Array<{ hour: string; total: number }>;
  topProducts: Array<{ name: string; quantity: number; total: number }>;
  recentBills: Array<{
    id: string;
    paidAt: string;
    tableLabel: string;
    waiterName: string;
    items: number;
    total: number;
    paymentMethod: "CASH" | "CARD" | "MIXED";
  }>;
};

type MetricCardProps = {
  label: string;
  value: string;
  comparison: MetricComparison;
  icon: string;
  accent: string;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const nextStats = await api.get<DashboardStatsResponse>("/stats/dashboard");

        if (!cancelled) {
          setStats(nextStats);
          setError(null);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "No se pudo cargar el dashboard";

        if (!cancelled) {
          setError(message);
          showToast({ type: "error", title: "Dashboard", message });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const topProductMax = useMemo(() => {
    if (!stats || stats.topProducts.length === 0) {
      return 0;
    }

    return Math.max(...stats.topProducts.map((product) => product.quantity));
  }, [stats]);

  if (loading) {
    return (
      <section className="space-y-6 page-enter">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="surface-card p-5" key={index}>
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="mt-4 h-7 w-28" />
              <Skeleton className="mt-2 h-4 w-20" />
              <Skeleton className="mt-4 h-3 w-24" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="surface-card p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-6 h-64 w-full" />
          </div>
          <div className="surface-card p-6">
            <Skeleton className="h-6 w-44" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton className="h-12 w-full" key={index} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!stats || error) {
    return (
      <section className="surface-card p-6 page-enter">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="mt-3 text-sm text-[var(--color-danger)]">
          {error ?? "No se pudo cargar el dashboard."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Resumen rapido del negocio hoy: ventas, pedidos, ocupacion y actividad reciente.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          accent="bg-emerald-50 text-emerald-700"
          comparison={stats.totalSales}
          icon="EUR"
          label="Ventas hoy"
          value={formatCurrency(stats.totalSales.current)}
        />
        <MetricCard
          accent="bg-blue-50 text-blue-700"
          comparison={stats.totalOrders}
          icon="OK"
          label="Pedidos completados"
          value={String(stats.totalOrders.current)}
        />
        <MetricCard
          accent="bg-amber-50 text-amber-700"
          comparison={stats.averageTicket}
          icon="TKT"
          label="Ticket medio"
          value={formatCurrency(stats.averageTicket.current)}
        />
        <MetricCard
          accent="bg-stone-100 text-stone-700"
          comparison={stats.activeTables}
          icon="TAB"
          label="Mesas activas"
          value={String(stats.activeTables.current)}
        />
      </div>

      <section className="surface-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Cobros por metodo de pago</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Resumen de hoy en efectivo, tarjeta y mixto.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <PaymentBreakdownCard
            accent="bg-emerald-50 text-emerald-700"
            count={stats.paymentBreakdown.cash.count}
            label="Efectivo"
            total={stats.paymentBreakdown.cash.total}
          />
          <PaymentBreakdownCard
            accent="bg-blue-50 text-blue-700"
            count={stats.paymentBreakdown.card.count}
            label="Tarjeta"
            total={stats.paymentBreakdown.card.total}
          />
          <PaymentBreakdownCard
            accent="bg-amber-50 text-amber-700"
            count={stats.paymentBreakdown.mixed.count}
            label="Mixto"
            total={stats.paymentBreakdown.mixed.total}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Ventas por hora hoy</h2>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              Hasta ahora
            </span>
          </div>

          <div className="mt-6 h-72">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={stats.salesByHour}>
                <CartesianGrid stroke="#ece8e0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" stroke="#7c746c" tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#7c746c"
                  tickFormatter={(value) => `${value} EUR`}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e2dc",
                    boxShadow: "0 8px 22px rgba(0,0,0,0.08)"
                  }}
                  formatter={(value) =>
                    formatCurrency(
                      Number(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0))
                    )
                  }
                />
                <Bar dataKey="total" fill="#E85D2A" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Productos mas vendidos hoy</h2>

          <div className="mt-6 space-y-4">
            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Todavia no hay ventas registradas hoy.
              </p>
            ) : (
              stats.topProducts.map((product, index) => {
                const width = topProductMax > 0 ? (product.quantity / topProductMax) * 100 : 0;
                const colorClass =
                  index === 0
                    ? "bg-[var(--color-primary)]"
                    : index === 1
                      ? "bg-amber-500"
                      : "bg-stone-400";

                return (
                  <div key={product.name}>
                    <div className="flex items-center gap-3">
                      <span className="mono w-6 text-sm font-semibold text-[var(--color-text-muted)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                          {product.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {product.quantity} uds · {formatCurrency(product.total)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                      <div
                        className={`h-full rounded-full ${colorClass}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Ultimas cuentas cobradas</h2>
        </div>

        {stats.recentBills.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-base font-semibold text-[var(--color-text)]">Todavia no hay cuentas hoy</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Cuando se empiecen a cobrar mesas, apareceran aqui las ultimas diez.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[0.7fr_1fr_1fr_0.6fr_0.8fr_0.8fr] gap-4 bg-[var(--color-surface-muted)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)] md:grid">
              <span>Hora</span>
              <span>Mesa</span>
              <span>Camarero</span>
              <span>Items</span>
              <span>Total</span>
              <span>Pago</span>
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              {stats.recentBills.map((bill) => (
                <button
                  aria-label={`Ver cuenta ${bill.tableLabel}`}
                  className="block w-full text-left transition-colors duration-200 hover:bg-[var(--color-surface-muted)]"
                  key={bill.id}
                  onClick={() => navigate(`/bills?billId=${bill.id}`)}
                  type="button"
                >
                  <div className="space-y-2 px-5 py-4 md:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span className="mono text-sm font-semibold text-[var(--color-text)]">
                        {formatTime(bill.paidAt)}
                      </span>
                      <span className="text-sm font-semibold text-[var(--color-text)]">
                        {formatCurrency(bill.total)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{bill.tableLabel}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {bill.waiterName} · {bill.items} items · {formatPaymentMethod(bill.paymentMethod)}
                    </p>
                  </div>

                  <div className="hidden grid-cols-[0.7fr_1fr_1fr_0.6fr_0.8fr_0.8fr] items-center gap-4 px-5 py-4 text-sm md:grid">
                    <span className="mono font-semibold text-[var(--color-text)]">
                      {formatTime(bill.paidAt)}
                    </span>
                    <span className="text-[var(--color-text)]">{bill.tableLabel}</span>
                    <span className="text-[var(--color-text-muted)]">{bill.waiterName}</span>
                    <span className="text-[var(--color-text-muted)]">{bill.items}</span>
                    <span className="mono font-semibold text-[var(--color-text)]">
                      {formatCurrency(bill.total)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      {formatPaymentMethod(bill.paymentMethod)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function PaymentBreakdownCard(props: {
  label: string;
  count: number;
  total: number;
  accent: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${props.accent}`}>
        {props.label}
      </div>
      <p className="mono mt-4 text-2xl font-bold text-[var(--color-text)]">
        {formatCurrency(props.total)}
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {props.count} cobro{props.count === 1 ? "" : "s"}
      </p>
    </article>
  );
}

function MetricCard(props: MetricCardProps) {
  const { label, value, comparison, icon, accent } = props;
  const comparisonText = getComparisonText(comparison.changePercent, comparison.previous);

  return (
    <article className="surface-card p-5">
      <div className="flex items-start gap-4">
        <div
          className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${accent}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="mono text-2xl font-bold text-[var(--color-text)]">{value}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{label}</p>
          <p
            className={`mt-3 text-xs font-medium ${
              comparison.changePercent === null
                ? "text-[var(--color-text-muted)]"
                : comparison.changePercent >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
            }`}
          >
            {comparisonText}
          </p>
        </div>
      </div>
    </article>
  );
}

function getComparisonText(changePercent: number | null, previous: number | null) {
  if (previous === null || changePercent === null) {
    return "Sin comparativa disponible";
  }

  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(0)}% vs ayer`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
