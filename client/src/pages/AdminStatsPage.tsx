import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { StatsResponse } from "@tpv/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchStats } from "../lib/stats";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

type TooltipValue = number | string | ReadonlyArray<number | string> | undefined;

function getNumericValue(value: TooltipValue) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (Array.isArray(value) && value.length > 0) {
    return getNumericValue(value[0]);
  }

  return 0;
}

function formatCurrencyTooltip(value: TooltipValue) {
  return formatCurrency(getNumericValue(value));
}

function formatUnitsTooltip(value: TooltipValue, unit: string) {
  return `${getNumericValue(value)} ${unit}`;
}

function StatCard(props: { label: string; value: string; hint: string }) {
  const { label, value, hint } = props;

  return (
    <article className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
      <p className="mt-2 text-sm text-stone-600">{hint}</p>
    </article>
  );
}

function ChartCard(props: { title: string; children: ReactNode }) {
  const { title, children } = props;

  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-200/60">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <div className="mt-6 h-72">{children}</div>
    </section>
  );
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const nextStats = await fetchStats();
        if (!cancelled) {
          setStats(nextStats);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar las estadisticas"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-stone-600">Cargando estadisticas...</p>;
  }

  if (error || !stats) {
    return <p className="text-red-600">{error ?? "No hay datos disponibles."}</p>;
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Admin / Stats
          </p>
          <h1 className="text-4xl font-bold text-stone-900">
            Dashboard de estadisticas
          </h1>
        </div>
        <p className="text-sm text-stone-500">
          Rango: {new Date(stats.range.from).toLocaleDateString("es-ES")} -{" "}
          {new Date(stats.range.to).toLocaleDateString("es-ES")}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="Promedio por cuenta cerrada"
          label="Ticket medio"
          value={formatCurrency(stats.summary.ticketAverage)}
        />
        <StatCard
          hint="Total facturado esta semana"
          label="Semana actual"
          value={formatCurrency(stats.summary.currentWeekSales)}
        />
        <StatCard
          hint="Referencia del periodo anterior"
          label="Semana anterior"
          value={formatCurrency(stats.summary.previousWeekSales)}
        />
        <StatCard
          hint="Variacion porcentual respecto a la semana anterior"
          label="Comparativa"
          value={`${stats.summary.weekOverWeekChange.toFixed(1)}%`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Ventas del dia actual">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.salesByHour}>
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#78716c" />
              <YAxis stroke="#78716c" />
              <Tooltip formatter={formatCurrencyTooltip} />
              <Bar dataKey="value" fill="#0f766e" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ventas de la semana">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.salesByDay}>
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#78716c" />
              <YAxis stroke="#78716c" />
              <Tooltip formatter={formatCurrencyTooltip} />
              <Line
                dataKey="value"
                dot={{ fill: "#ea580c", r: 5 }}
                stroke="#ea580c"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Productos mas vendidos">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topProducts} layout="vertical">
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis stroke="#78716c" type="number" />
              <YAxis dataKey="label" stroke="#78716c" type="category" width={110} />
              <Tooltip formatter={(value) => formatUnitsTooltip(value, "uds")} />
              <Bar dataKey="quantity" fill="#2563eb" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mesas con mas rotacion">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.tableRotations}>
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#78716c" />
              <YAxis stroke="#78716c" />
              <Tooltip formatter={(value) => formatUnitsTooltip(value, "turnos")} />
              <Bar dataKey="turns" radius={[10, 10, 0, 0]}>
                {stats.tableRotations.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={entry.turns >= 7 ? "#16a34a" : "#f59e0b"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <ChartCard title="Horas punta">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.peakHours}>
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#78716c" />
              <YAxis stroke="#78716c" />
              <Tooltip formatter={(value) => formatUnitsTooltip(value, "pedidos")} />
              <Bar dataKey="orders" fill="#7c3aed" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="rounded-[1.75rem] border border-stone-200 bg-stone-900 p-6 text-white shadow-sm shadow-stone-200/60">
          <h2 className="text-lg font-semibold">Resumen operativo</h2>
          <div className="mt-6 space-y-4 text-sm text-stone-300">
            <p>
              La franja mas fuerte se concentra entre las 14:00 y las 15:00,
              seguida del pico de cenas a las 21:00.
            </p>
            <p>
              El producto con mayor salida es{" "}
              <span className="font-semibold text-white">
                {stats.topProducts[0]?.label}
              </span>
              .
            </p>
            <p>
              La mejor mesa en rotacion es{" "}
              <span className="font-semibold text-white">
                {stats.tableRotations[0]?.label}
              </span>
              .
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
