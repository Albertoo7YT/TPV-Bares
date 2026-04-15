import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Skeleton from "../components/Skeleton";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { api } from "../services/api";

type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";
type TableSummary = { activeOrdersCount: number; partialTotal: number };
type TableItem = {
  id: string;
  number: number;
  name: string | null;
  zone?: string;
  capacity: number;
  status: TableStatus;
  summary: TableSummary | null;
};
type TableListResponse = { tables: TableItem[] };

const cardStyles: Record<TableStatus, string> = {
  FREE: "border border-[#E5E2DC] bg-white",
  OCCUPIED: "border border-[#E85D2A] border-l-[3px] border-l-[#E85D2A] bg-[#FFF7ED]",
  RESERVED: "border border-blue-300 bg-blue-50"
};

const statusBadgeStyles: Record<TableStatus, string> = {
  FREE: "bg-slate-100 text-slate-600",
  OCCUPIED: "bg-orange-100 text-[var(--color-primary)]",
  RESERVED: "bg-blue-100 text-blue-700"
};

export default function TablesPage() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTableId, setBusyTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshTables(options?: { silent?: boolean }) {
    try {
      const response = await api.get<TableListResponse>("/tables");
      setTables(response.tables);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar las mesas";
      setError(message);
      if (!options?.silent) showToast({ type: "error", title: "Mesas", message });
    }
  }

  const pullToRefresh = usePullToRefresh({
    enabled: !loading,
    onRefresh: async () => {
      await refreshTables();
      showToast({ type: "info", title: "Mesas", message: "Mesas actualizadas" });
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTables() {
      try {
        const response = await api.get<TableListResponse>("/tables");
        if (!cancelled) {
          setTables(response.tables);
          setError(null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar las mesas";
        if (!cancelled) {
          setError(message);
          showToast({ type: "error", title: "Mesas", message });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTables();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!socket) return;

    function refresh() {
      void refreshTables({ silent: true });
    }

    socket.on("table:statusChanged", refresh);
    socket.on("order:new", refresh);
    socket.on("order:updated", refresh);
    socket.on("order:cancelled", refresh);
    socket.on("bill:created", refresh);

    return () => {
      socket.off("table:statusChanged", refresh);
      socket.off("order:new", refresh);
      socket.off("order:updated", refresh);
      socket.off("order:cancelled", refresh);
      socket.off("bill:created", refresh);
    };
  }, [socket]);

  const interiorTables = tables.filter((table) => !isTerraceTable(table));
  const terraceTables = tables.filter((table) => isTerraceTable(table));
  const occupiedCount = tables.filter((table) => table.status === "OCCUPIED").length;
  const freeCount = tables.filter((table) => table.status === "FREE").length;

  const handleTablePress = async (table: TableItem) => {
    if (busyTableId) return;
    if (table.status === "OCCUPIED") return void navigate(`/order/${table.id}`);
    if (table.status === "RESERVED") {
      const confirmed = window.confirm(`La mesa ${table.name ?? table.number} esta reservada. ¿Quieres abrirla ahora?`);
      if (!confirmed) return;
    }

    setBusyTableId(table.id);
    setError(null);
    try {
      await api.patch<TableItem>(`/tables/${table.id}/status`, { status: "OCCUPIED" });
      navigate(`/order/${table.id}`);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "No se pudo abrir la mesa";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setBusyTableId(null);
    }
  };

  return (
    <section className="space-y-5" {...pullToRefresh.bind}>
      <PullIndicator isRefreshing={pullToRefresh.isRefreshing} pullDistance={pullToRefresh.pullDistance} />

      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Mesas</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {occupiedCount} ocupadas · {freeCount} libres
        </p>
      </header>

      {error ? <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div> : null}

      <TablesSection busyTableId={busyTableId} emptyLabel="No hay mesas interiores configuradas." loading={loading} onTablePress={handleTablePress} tables={interiorTables} title="Interior" />
      <TablesSection busyTableId={busyTableId} emptyLabel="No hay mesas de terraza configuradas." loading={loading} onTablePress={handleTablePress} tables={terraceTables} title="Terraza" />

      <section className="mt-12 border-t border-[var(--color-border)] pb-20 pt-6 text-center md:pb-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          {user?.name ?? "-"} · {formatRoleLabel(user?.role)}
        </p>
        <button
          aria-label="Cerrar sesión"
          className="mx-auto mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors duration-200 hover:text-[var(--color-primary)]"
          onClick={logout}
          type="button"
        >
          <LogoutIcon />
          Cerrar sesión
        </button>
      </section>

      {user?.role === "ADMIN" ? (
        <button aria-label="Gestionar mesas" className="btn-primary fixed bottom-24 right-4 px-5 py-3 text-sm font-medium shadow-sm md:bottom-6" onClick={() => navigate("/admin/tables")} type="button">
          Gestionar mesas
        </button>
      ) : null}
    </section>
  );
}

function TablesSection(props: { title: string; tables: TableItem[]; loading: boolean; busyTableId: string | null; emptyLabel: string; onTablePress: (table: TableItem) => void }) {
  const { title, tables, loading, busyTableId, emptyLabel, onTablePress } = props;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="surface-card min-h-[68px] rounded-xl p-4" key={`${title}-${index}`}>
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="surface-card px-5 py-4 text-sm text-[var(--color-text-muted)]">{emptyLabel}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <button
              key={table.id}
              aria-label={`Abrir mesa ${table.number}`}
              className={`min-h-[68px] rounded-xl px-3.5 py-3 text-left transition-all duration-200 ${cardStyles[table.status]}`}
              disabled={busyTableId === table.id}
              onClick={() => onTablePress(table)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="mono text-2xl font-bold text-[var(--color-text)]">{table.number}</p>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBadgeStyles[table.status]}`}
                  >
                    {formatStatusLabel(table.status)}
                  </span>
                  {table.status === "OCCUPIED" && table.summary && table.summary.partialTotal > 0 ? (
                    <p className="text-sm font-bold text-[var(--color-text)]">{formatCurrency(table.summary.partialTotal)}</p>
                  ) : null}
                </div>
              </div>

              {table.status === "OCCUPIED" && table.summary && (table.summary.activeOrdersCount > 0 || table.summary.partialTotal > 0) ? (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {table.summary.activeOrdersCount} {table.summary.activeOrdersCount === 1 ? "pedido" : "pedidos"}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function PullIndicator(props: { pullDistance: number; isRefreshing: boolean }) {
  const { pullDistance, isRefreshing } = props;
  if (!isRefreshing && pullDistance < 8) return null;
  return (
    <div aria-live="polite" className="flex items-center justify-center" style={{ height: Math.min(48, pullDistance) }}>
      <div className="surface-card px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">
        <Spinner className="h-3.5 w-3.5" label={isRefreshing ? "Actualizando..." : "Suelta para actualizar"} />
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M10 7V5a2 2 0 0 1 2-2h6v18h-6a2 2 0 0 1-2-2v-2M15 12H4m0 0 3-3m-3 3 3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function isTerraceTable(table: Pick<TableItem, "name">) {
  return (table.name ?? "").toLowerCase().includes("terraza");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

function formatRoleLabel(role: string | undefined) {
  if (role === "ADMIN") return "Administrador";
  if (role === "WAITER") return "Camarero/a";
  if (role === "KITCHEN") return "Cocina";
  return "-";
}

function formatStatusLabel(status: TableStatus) {
  if (status === "FREE") return "Libre";
  if (status === "OCCUPIED") return "Ocupada";
  return "Reservada";
}
