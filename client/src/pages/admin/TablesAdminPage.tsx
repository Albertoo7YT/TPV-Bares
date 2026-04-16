import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";
type TableSummary = { activeOrdersCount: number; partialTotal: number } | null;
type TableItem = {
  id: string;
  number: number;
  name: string | null;
  zone: string;
  capacity: number;
  status: TableStatus;
  summary: TableSummary;
};
type TableZone = { name: string; count: number; tables: TableItem[] };
type TableListResponse = { tables: TableItem[]; zones: TableZone[] };
type TableFormState = {
  id?: string;
  number: string;
  name: string;
  capacity: string;
  zone: string;
  status: Extract<TableStatus, "FREE" | "RESERVED">;
};
type BulkFormState = {
  fromNumber: string;
  toNumber: string;
  capacity: string;
  zone: string;
  status: Extract<TableStatus, "FREE" | "RESERVED">;
};

const CUSTOM_ZONE_VALUE = "__custom__";

export default function TablesAdminPage() {
  const { showToast } = useToast();
  const [tablesResponse, setTablesResponse] = useState<TableListResponse>({
    tables: [],
    zones: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableModal, setTableModal] = useState<TableFormState | null>(null);
  const [bulkModal, setBulkModal] = useState<BulkFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TableItem | null>(null);

  useEffect(() => {
    void loadTables();
  }, []);

  async function loadTables() {
    try {
      const nextTables = await api.get<TableListResponse>("/tables");
      setTablesResponse(nextTables);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar las mesas";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setLoading(false);
    }
  }

  const zoneOptions = useMemo(() => {
    const knownZones = new Set(tablesResponse.zones.map((zone) => zone.name));
    knownZones.add("Interior");
    knownZones.add("Terraza");
    knownZones.add("Barra");
    return Array.from(knownZones).sort((left, right) => left.localeCompare(right));
  }, [tablesResponse.zones]);

  function openCreateModal() {
    setTableModal({
      number: "",
      name: "",
      capacity: "4",
      zone: "Interior",
      status: "FREE"
    });
  }

  function openEditModal(table: TableItem) {
    setTableModal({
      id: table.id,
      number: String(table.number),
      name: table.name ?? "",
      capacity: String(table.capacity),
      zone: table.zone,
      status: table.status === "RESERVED" ? "RESERVED" : "FREE"
    });
  }

  function validateTableForm(form: TableFormState) {
    const number = Number(form.number);
    const capacity = Number(form.capacity);
    const zone = form.zone.trim();

    if (!Number.isInteger(number) || number < 1) {
      throw new Error("El numero de mesa debe ser un entero mayor que 0");
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("La capacidad debe ser al menos 1");
    }

    const duplicated = tablesResponse.tables.some(
      (table) => table.number === number && table.id !== form.id
    );

    if (duplicated) {
      throw new Error(`La mesa ${number} ya existe`);
    }

    if (!zone) {
      throw new Error("La zona es obligatoria");
    }

    return {
      number,
      name: form.name.trim() || null,
      capacity,
      zone,
      status: form.status
    };
  }

  async function handleSaveTable() {
    if (!tableModal) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = validateTableForm(tableModal);

      if (tableModal.id) {
        await api.put(`/tables/${tableModal.id}`, payload);
        showToast({ type: "success", title: "Mesas", message: "Mesa actualizada" });
      } else {
        await api.post("/tables", payload);
        showToast({ type: "success", title: "Mesas", message: "Mesa creada" });
      }

      setTableModal(null);
      await loadTables();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "No se pudo guardar la mesa";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTable() {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.status !== "FREE") {
      const message = "No se puede eliminar una mesa con servicio activo";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
      return;
    }

    setSaving(true);

    try {
      await api.delete(`/tables/${deleteTarget.id}`);
      showToast({ type: "success", title: "Mesas", message: "Mesa eliminada" });
      setDeleteTarget(null);
      await loadTables();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la mesa";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateBulk() {
    if (!bulkModal) {
      return;
    }

    const fromNumber = Number(bulkModal.fromNumber);
    const toNumber = Number(bulkModal.toNumber);
    const capacity = Number(bulkModal.capacity);
    const zone = bulkModal.zone.trim();

    if (!Number.isInteger(fromNumber) || fromNumber < 1) {
      return showError("El numero inicial no es valido");
    }

    if (!Number.isInteger(toNumber) || toNumber < fromNumber) {
      return showError("El numero final debe ser mayor o igual al inicial");
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      return showError("La capacidad debe ser al menos 1");
    }

    if (!zone) {
      return showError("La zona es obligatoria");
    }

    setSaving(true);
    setError(null);

    try {
      await api.post("/tables/bulk", {
        fromNumber,
        toNumber,
        capacity,
        zone,
        status: bulkModal.status
      });
      showToast({
        type: "success",
        title: "Mesas",
        message: `Se han creado ${toNumber - fromNumber + 1} mesas`
      });
      setBulkModal(null);
      await loadTables();
    } catch (bulkError) {
      const message =
        bulkError instanceof Error ? bulkError.message : "No se pudieron crear las mesas";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setSaving(false);
    }
  }

  function showError(message: string) {
    setError(message);
    showToast({ type: "warning", title: "Mesas", message });
  }

  async function handleMoveZone(zoneName: string, direction: "up" | "down") {
    const currentIndex = tablesResponse.zones.findIndex((zone) => zone.name === zoneName);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= tablesResponse.zones.length) {
      return;
    }

    const nextZones = [...tablesResponse.zones];
    const [movedZone] = nextZones.splice(currentIndex, 1);
    if (!movedZone) {
      return;
    }
    nextZones.splice(targetIndex, 0, movedZone);

    setSaving(true);
    setError(null);

    try {
      const response = await api.patch<TableListResponse>("/tables/zones/order", {
        zones: nextZones.map((zone) => zone.name)
      });
      setTablesResponse(response);
      showToast({ type: "success", title: "Mesas", message: "Orden de zonas actualizado" });
    } catch (moveError) {
      const message = moveError instanceof Error ? moveError.message : "No se pudo reordenar la zona";
      setError(message);
      showToast({ type: "error", title: "Mesas", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Gestion de mesas</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Configura las mesas de tu restaurante
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="btn-secondary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-medium"
            onClick={() =>
              setBulkModal({
                fromNumber: "1",
                toNumber: "12",
                capacity: "4",
                zone: "Interior",
                status: "FREE"
              })
            }
            type="button"
          >
            Crear varias mesas
          </button>
          <button
            className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
            onClick={openCreateModal}
            type="button"
          >
            <span className="text-base">+</span>
            Nueva mesa
          </button>
        </div>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="surface-card p-5" key={index}>
              <div className="h-5 w-24 animate-pulse rounded bg-[var(--color-surface-muted)]" />
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-[var(--color-surface-muted)]" />
              <div className="mt-4 h-4 w-24 animate-pulse rounded bg-[var(--color-surface-muted)]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {tablesResponse.zones.map((zone) => (
            <section className="space-y-4" key={zone.name}>
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">{zone.name}</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {zone.count} mesa{zone.count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost min-h-11 px-3 py-2 text-sm disabled:opacity-40"
                    disabled={saving || tablesResponse.zones[0]?.name === zone.name}
                    onClick={() => void handleMoveZone(zone.name, "up")}
                    type="button"
                  >
                    Subir
                  </button>
                  <button
                    className="btn-ghost min-h-11 px-3 py-2 text-sm disabled:opacity-40"
                    disabled={saving || tablesResponse.zones[tablesResponse.zones.length - 1]?.name === zone.name}
                    onClick={() => void handleMoveZone(zone.name, "down")}
                    type="button"
                  >
                    Bajar
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {zone.tables.map((table) => (
                  <article className="surface-card p-5" key={table.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="mono text-3xl font-bold text-[var(--color-text)]">
                          {table.number}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                          {table.name || zone.name}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadge(table.status)}`}>
                        {getTableStatusLabel(table.status)}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                      <PeopleIcon />
                      <span>{table.capacity} personas</span>
                    </div>

                    <div className="mt-5 flex gap-2">
                      <button
                        className="btn-secondary flex-1 px-3 py-2 text-sm font-medium"
                        onClick={() => openEditModal(table)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="btn-danger flex-1 px-3 py-2 text-sm font-medium"
                        onClick={() => setDeleteTarget(table)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tableModal ? (
        <ModalCard onClose={() => setTableModal(null)} title={tableModal.id ? "Editar mesa" : "Nueva mesa"}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Numero de mesa" required>
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) =>
                  setTableModal((current) =>
                    current ? { ...current, number: event.target.value.replace(/\D/g, "") } : current
                  )
                }
                value={tableModal.number}
              />
            </Field>

            <Field label="Capacidad" required>
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) =>
                  setTableModal((current) =>
                    current ? { ...current, capacity: event.target.value.replace(/\D/g, "") } : current
                  )
                }
                value={tableModal.capacity}
              />
            </Field>

            <Field label="Nombre">
              <input
                className="field-input"
                onChange={(event) =>
                  setTableModal((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
                placeholder="Ej: Terraza esquina"
                value={tableModal.name}
              />
            </Field>

            <Field label="Estado inicial">
              <select
                className="field-input"
                onChange={(event) =>
                  setTableModal((current) =>
                    current
                      ? { ...current, status: event.target.value as TableFormState["status"] }
                      : current
                  )
                }
                value={tableModal.status}
              >
                <option value="FREE">Libre</option>
                <option value="RESERVED">Reservada</option>
              </select>
            </Field>

            <Field label="Zona" required>
              <div className="space-y-3">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setTableModal((current) =>
                      current
                        ? {
                            ...current,
                            zone:
                              event.target.value === CUSTOM_ZONE_VALUE
                                ? ""
                                : event.target.value
                          }
                        : current
                    )
                  }
                  value={getZoneSelectValue(tableModal.zone, zoneOptions)}
                >
                  {zoneOptions.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                  <option value={CUSTOM_ZONE_VALUE}>Nueva zona...</option>
                </select>

                <p className="text-xs text-[var(--color-text-muted)]">
                  Elige una zona existente o selecciona &quot;Nueva zona...&quot; para crear una como Terraza, Salon o Barra.
                </p>

                {isCustomZone(tableModal.zone, zoneOptions) ? (
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setTableModal((current) =>
                        current ? { ...current, zone: event.target.value } : current
                      )
                    }
                    placeholder="Escribe la nueva zona"
                    value={tableModal.zone}
                  />
                ) : null}
              </div>
            </Field>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setTableModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-primary min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => void handleSaveTable()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar"}
            </button>
          </div>
        </ModalCard>
      ) : null}

      {bulkModal ? (
        <ModalCard onClose={() => setBulkModal(null)} title="Crear varias mesas">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Desde" required>
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) =>
                  setBulkModal((current) =>
                    current ? { ...current, fromNumber: event.target.value.replace(/\D/g, "") } : current
                  )
                }
                value={bulkModal.fromNumber}
              />
            </Field>

            <Field label="Hasta" required>
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) =>
                  setBulkModal((current) =>
                    current ? { ...current, toNumber: event.target.value.replace(/\D/g, "") } : current
                  )
                }
                value={bulkModal.toNumber}
              />
            </Field>

            <Field label="Capacidad" required>
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) =>
                  setBulkModal((current) =>
                    current ? { ...current, capacity: event.target.value.replace(/\D/g, "") } : current
                  )
                }
                value={bulkModal.capacity}
              />
            </Field>

            <Field label="Estado inicial">
              <select
                className="field-input"
                onChange={(event) =>
                  setBulkModal((current) =>
                    current
                      ? { ...current, status: event.target.value as BulkFormState["status"] }
                      : current
                  )
                }
                value={bulkModal.status}
              >
                <option value="FREE">Libre</option>
                <option value="RESERVED">Reservada</option>
              </select>
            </Field>

            <Field label="Zona" required>
              <div className="space-y-3">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setBulkModal((current) =>
                      current
                        ? {
                            ...current,
                            zone:
                              event.target.value === CUSTOM_ZONE_VALUE
                                ? ""
                                : event.target.value
                          }
                        : current
                    )
                  }
                  value={getZoneSelectValue(bulkModal.zone, zoneOptions)}
                >
                  {zoneOptions.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                  <option value={CUSTOM_ZONE_VALUE}>Nueva zona...</option>
                </select>

                <p className="text-xs text-[var(--color-text-muted)]">
                  Puedes crear varias mesas en una zona nueva escribiendo su nombre debajo.
                </p>

                {isCustomZone(bulkModal.zone, zoneOptions) ? (
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setBulkModal((current) =>
                        current ? { ...current, zone: event.target.value } : current
                      )
                    }
                    placeholder="Escribe la nueva zona"
                    value={bulkModal.zone}
                  />
                ) : null}
              </div>
            </Field>
          </div>

          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text)]">
            {buildBulkPreview(bulkModal)}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setBulkModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-primary min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => void handleCreateBulk()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Creando" /> : buildBulkButtonLabel(bulkModal)}
            </button>
          </div>
        </ModalCard>
      ) : null}

      {deleteTarget ? (
        <ModalCard onClose={() => setDeleteTarget(null)} title="Eliminar mesa">
          <div className="space-y-3">
            <p className="text-base font-semibold text-[var(--color-text)]">
              Eliminar mesa {deleteTarget.number}
              {deleteTarget.name ? ` · ${deleteTarget.name}` : ""}
            </p>
            {deleteTarget.status === "FREE" ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                La mesa se eliminara definitivamente de la configuracion del restaurante.
              </p>
            ) : (
              <p className="text-sm text-[var(--color-danger)]">
                No se puede eliminar una mesa con servicio activo
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setDeleteTarget(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-danger min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving || deleteTarget.status !== "FREE"}
              onClick={() => void handleDeleteTable()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Eliminando" /> : "Eliminar"}
            </button>
          </div>
        </ModalCard>
      ) : null}
    </section>
  );
}

function Field(props: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
        {props.label} {props.required ? <span className="text-[var(--color-danger)]">*</span> : null}
      </span>
      {props.children}
    </label>
  );
}

function ModalCard(props: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
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

function getStatusBadge(status: TableStatus) {
  if (status === "FREE") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "RESERVED") {
    return "border border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border border-red-200 bg-red-50 text-red-700";
}

function getTableStatusLabel(status: TableStatus) {
  if (status === "FREE") {
    return "Libre";
  }

  if (status === "RESERVED") {
    return "Reservada";
  }

  return "Ocupada";
}

function getZoneSelectValue(zone: string, options: string[]) {
  const normalizedZone = zone.trim();
  if (!normalizedZone) {
    return CUSTOM_ZONE_VALUE;
  }

  return options.includes(normalizedZone) ? normalizedZone : CUSTOM_ZONE_VALUE;
}

function isCustomZone(zone: string, options: string[]) {
  return getZoneSelectValue(zone, options) === CUSTOM_ZONE_VALUE;
}

function buildBulkPreview(form: BulkFormState) {
  const from = Number(form.fromNumber);
  const to = Number(form.toNumber);
  const capacity = Number(form.capacity);

  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || !Number.isInteger(capacity)) {
    return "Completa el rango y la capacidad para ver la preview.";
  }

  const count = to - from + 1;
  return `Se crearan ${count} mesas (${from}-${to}) con capacidad para ${capacity} personas en ${form.zone || "la zona indicada"}.`;
}

function buildBulkButtonLabel(form: BulkFormState) {
  const from = Number(form.fromNumber);
  const to = Number(form.toNumber);

  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
    return "Crear mesas";
  }

  return `Crear ${to - from + 1} mesas`;
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24">
      <path d="M7.5 11a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm9 0a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM3.5 18.25c0-2.35 2.08-4.25 4.64-4.25 2.56 0 4.64 1.9 4.64 4.25M11.25 18.25c.23-1.96 2.09-3.5 4.35-3.5 2.42 0 4.4 1.78 4.4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
