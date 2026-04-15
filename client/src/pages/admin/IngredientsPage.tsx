import { useEffect, useMemo, useState } from "react";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type IngredientCategory = "BASE" | "SAUCE" | "EXTRA" | "TOPPING";

type Ingredient = {
  id: string;
  name: string;
  category: IngredientCategory;
  extraPrice: number | string;
  available: boolean;
  order: number;
};

type IngredientForm = {
  id?: string;
  name: string;
  category: IngredientCategory;
  extraPrice: string;
  available: boolean;
  order: string;
};

const categories: IngredientCategory[] = ["BASE", "SAUCE", "EXTRA", "TOPPING"];

export default function IngredientsPage() {
  const { showToast } = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<IngredientForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadIngredients();
  }, []);

  async function loadIngredients() {
    try {
      setLoading(true);
      setIngredients(await api.get<Ingredient[]>("/ingredients"));
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar los ingredientes";
      setError(message);
      showToast({ type: "error", title: "Ingredientes", message });
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: ingredients.filter((ingredient) => ingredient.category === category)
      })),
    [ingredients]
  );

  function openCreateModal(category: IngredientCategory) {
    setModal({
      name: "",
      category,
      extraPrice: "0",
      available: true,
      order: String(
        ingredients.filter((ingredient) => ingredient.category === category).length
      )
    });
  }

  function openEditModal(ingredient: Ingredient) {
    setModal({
      id: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
      extraPrice: String(ingredient.extraPrice),
      available: ingredient.available,
      order: String(ingredient.order)
    });
  }

  async function handleSave() {
    if (!modal) return;

    setSaving(true);

    try {
      const payload = {
        name: modal.name.trim(),
        category: modal.category,
        extraPrice: Number(modal.extraPrice || 0),
        available: modal.available,
        order: Number(modal.order || 0)
      };

      if (modal.id) {
        await api.put(`/ingredients/${modal.id}`, payload);
        showToast({ type: "success", title: "Ingredientes", message: "Ingrediente actualizado" });
      } else {
        await api.post("/ingredients", payload);
        showToast({ type: "success", title: "Ingredientes", message: "Ingrediente creado" });
      }

      setModal(null);
      await loadIngredients();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "No se pudo guardar el ingrediente";
      showToast({ type: "error", title: "Ingredientes", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ingredient: Ingredient) {
    if (!window.confirm(`Desactivar ingrediente "${ingredient.name}"?`)) {
      return;
    }

    try {
      await api.delete(`/ingredients/${ingredient.id}`);
      showToast({ type: "success", title: "Ingredientes", message: "Ingrediente desactivado" });
      await loadIngredients();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el ingrediente";
      showToast({ type: "error", title: "Ingredientes", message });
    }
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Ingredientes</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Gestiona ingredientes base, salsas, toppings y extras disponibles.
          </p>
        </div>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="surface-card p-6">
          <Spinner className="h-5 w-5" label="Cargando ingredientes" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {grouped.map((group) => (
            <article key={group.category} className="surface-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">{group.category}</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {group.items.length} ingrediente{group.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button className="btn-primary px-4 py-2 text-sm font-medium" onClick={() => openCreateModal(group.category)} type="button">
                  Nuevo
                </button>
              </div>

              <div className="space-y-3">
                {group.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-5 text-sm text-[var(--color-text-muted)]">
                    No hay ingredientes en esta categoría.
                  </div>
                ) : (
                  group.items.map((ingredient) => (
                    <div key={ingredient.id} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--color-text)]">{ingredient.name}</p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                          Extra: {formatCurrency(toNumber(ingredient.extraPrice))} · Orden {ingredient.order} · {ingredient.available ? "Disponible" : "Desactivado"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="btn-ghost px-3 py-2 text-sm" onClick={() => openEditModal(ingredient)} type="button">
                          Editar
                        </button>
                        <button className="btn-danger px-3 py-2 text-sm" onClick={() => void handleDelete(ingredient)} type="button">
                          Desactivar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modal ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-end md:items-center md:justify-center">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">
                  {modal.id ? "Editar ingrediente" : "Nuevo ingrediente"}
                </h2>
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setModal(null)} type="button">
                  Cerrar
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Nombre</span>
                  <input className="field-input" onChange={(event) => setModal((current) => current ? { ...current, name: event.target.value } : current)} value={modal.name} />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Categoría</span>
                  <select className="field-input" onChange={(event) => setModal((current) => current ? { ...current, category: event.target.value as IngredientCategory } : current)} value={modal.category}>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Precio extra</span>
                  <input className="field-input" inputMode="decimal" onChange={(event) => setModal((current) => current ? { ...current, extraPrice: event.target.value.replace(",", ".") } : current)} value={modal.extraPrice} />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Orden</span>
                  <input className="field-input" inputMode="numeric" onChange={(event) => setModal((current) => current ? { ...current, order: event.target.value } : current)} value={modal.order} />
                </label>
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <input checked={modal.available} onChange={() => setModal((current) => current ? { ...current, available: !current.available } : current)} type="checkbox" />
                <span className="text-sm font-medium text-[var(--color-text)]">Ingrediente disponible</span>
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-secondary px-4 py-2.5 text-sm" onClick={() => setModal(null)} type="button">
                  Cancelar
                </button>
                <button className="btn-primary px-4 py-2.5 text-sm font-semibold" disabled={saving} onClick={() => void handleSave()} type="button">
                  {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function toNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}
