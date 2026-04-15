import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type Category = {
  id: string;
  name: string;
  order: number;
  active: boolean;
  productCount: number;
};

type CategoryFormState = {
  id?: string;
  name: string;
};

export default function CategoriesPage() {
  const { showToast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<CategoryFormState | null>(null);
  const [deleteModal, setDeleteModal] = useState<Category | null>(null);

  const orderedCategories = useMemo(
    () => [...categories].sort((left, right) => left.order - right.order),
    [categories]
  );

  useEffect(() => {
    void loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const nextCategories = await api.get<Category[]>("/categories/all");
      setCategories(nextCategories);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "No se pudieron cargar las categorias";
      setError(message);
      showToast({ type: "error", title: "Categorias", message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCategory() {
    if (!modal) {
      return;
    }

    const name = modal.name.trim();

    if (!name) {
      const message = "El nombre de la categoria es obligatorio";
      setError(message);
      showToast({ type: "warning", title: "Categorias", message });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (modal.id) {
        const category = orderedCategories.find((item) => item.id === modal.id);

        await api.put(`/categories/${modal.id}`, {
          name,
          order: category?.order ?? 1,
          active: category?.active ?? true
        });
        showToast({ type: "success", title: "Categorias", message: "Categoria actualizada" });
      } else {
        await api.post("/categories", {
          name,
          order: orderedCategories.length + 1
        });
        showToast({ type: "success", title: "Categorias", message: "Categoria creada" });
      }

      setModal(null);
      await loadCategories();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "No se pudo guardar la categoria";
      setError(message);
      showToast({ type: "error", title: "Categorias", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(category: Category) {
    try {
      await api.put(`/categories/${category.id}`, {
        name: category.name,
        order: category.order,
        active: !category.active
      });
      await loadCategories();
    } catch (toggleError) {
      const message =
        toggleError instanceof Error ? toggleError.message : "No se pudo actualizar la categoria";
      setError(message);
      showToast({ type: "error", title: "Categorias", message });
    }
  }

  async function handleDeleteCategory() {
    if (!deleteModal) {
      return;
    }

    setSaving(true);

    try {
      await api.delete(`/categories/${deleteModal.id}`);
      showToast({
        type: "success",
        title: "Categorias",
        message: "Categoria desactivada y productos ocultados"
      });
      setDeleteModal(null);
      await loadCategories();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la categoria";
      setError(message);
      showToast({ type: "error", title: "Categorias", message });
    } finally {
      setSaving(false);
    }
  }

  async function persistOrder(nextCategories: Category[]) {
    setDragging(true);

    try {
      const orderedIds = nextCategories.map((category) => category.id);
      const updated = await api.patch<Category[]>("/categories/reorder", { orderedIds });
      setCategories(updated);
    } catch (reorderError) {
      const message =
        reorderError instanceof Error ? reorderError.message : "No se pudo reordenar";
      setError(message);
      showToast({ type: "error", title: "Categorias", message });
      await loadCategories();
    } finally {
      setDragging(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedCategories.findIndex((category) => category.id === active.id);
    const newIndex = orderedCategories.findIndex((category) => category.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = arrayMove(orderedCategories, oldIndex, newIndex).map((category, index) => ({
      ...category,
      order: index + 1
    }));

    setCategories(reordered);
    await persistOrder(reordered);
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Categorias</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Organiza las secciones de tu carta y controla si se muestran en sala.
          </p>
        </div>

        <button
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
          onClick={() => setModal({ name: "" })}
          type="button"
        >
          <span className="text-base">+</span>
          Nueva categoria
        </button>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      <section className="surface-card p-4 md:p-5">
        {loading ? (
          <p className="px-2 py-6 text-sm text-[var(--color-text-muted)]">Cargando categorias...</p>
        ) : orderedCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-10 text-center">
            <p className="text-base font-semibold text-[var(--color-text)]">Todavia no hay categorias</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Crea la primera para empezar a organizar tu carta.
            </p>
          </div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)} sensors={sensors}>
            <SortableContext items={orderedCategories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {orderedCategories.map((category) => (
                  <SortableCategoryRow
                    category={category}
                    dragging={dragging}
                    key={category.id}
                    onDelete={() => setDeleteModal(category)}
                    onEdit={() => setModal({ id: category.id, name: category.name })}
                    onToggleActive={() => void handleToggleActive(category)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {modal ? (
        <ModalCard onClose={() => setModal(null)} title={modal.id ? "Editar categoria" : "Nueva categoria"}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">Nombre de la categoria</span>
              <input
                className="field-input"
                onChange={(event) =>
                  setModal((current) => (current ? { ...current, name: event.target.value } : current))
                }
                placeholder="Ej: Hamburguesas"
                value={modal.name}
              />
            </label>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                Preview
              </p>
              <div className="mt-3 inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)]">
                {modal.name.trim() || "Nombre de la categoria"}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-primary min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => void handleSaveCategory()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar"}
            </button>
          </div>
        </ModalCard>
      ) : null}

      {deleteModal ? (
        <ModalCard onClose={() => setDeleteModal(null)} title="Confirmar eliminacion">
          <div className="space-y-3">
            <p className="text-base font-semibold text-[var(--color-text)]">
              ¿Eliminar categoria {deleteModal.name}?
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Se desactivaran los {deleteModal.productCount} productos de esta categoria.
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Esta accion es un soft delete: la categoria quedara inactiva y no aparecera en la carta.
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setDeleteModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-danger min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => void handleDeleteCategory()}
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

function SortableCategoryRow(props: {
  category: Category;
  dragging: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { category, dragging, onToggleActive, onEdit, onDelete } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id });

  return (
    <article
      className={`surface-card flex flex-col gap-4 p-4 transition-all duration-200 md:flex-row md:items-center md:justify-between ${
        category.active ? "" : "opacity-50"
      } ${isDragging ? "shadow-md" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <button
          aria-label={`Arrastrar categoria ${category.name}`}
          className="btn-ghost inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)]"
          disabled={dragging}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>

        <div className="min-w-0">
          <p className="truncate text-base font-medium text-[var(--color-text)]">{category.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
              {category.productCount} {category.productCount === 1 ? "producto" : "productos"}
            </span>
            {!category.active ? (
              <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                Inactiva
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label={`Cambiar estado de ${category.name}`}
          className={`relative h-7 w-12 rounded-full transition-all duration-200 ${
            category.active ? "bg-emerald-500" : "bg-[#ddd6cb]"
          }`}
          onClick={onToggleActive}
          type="button"
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
              category.active ? "left-6" : "left-1"
            }`}
          />
        </button>
        <button
          aria-label={`Editar categoria ${category.name}`}
          className="btn-ghost inline-flex h-11 w-11 items-center justify-center rounded-xl"
          onClick={onEdit}
          type="button"
        >
          <EditIcon />
        </button>
        <button
          aria-label={`Eliminar categoria ${category.name}`}
          className="btn-danger inline-flex h-11 w-11 items-center justify-center rounded-xl"
          onClick={onDelete}
          type="button"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

function ModalCard(props: { title: string; children: ReactNode; onClose: () => void }) {
  const { title, children, onClose } = props;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
          <button className="btn-ghost min-h-11 px-3 py-2 text-sm" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24">
      <circle cx="8" cy="7" fill="currentColor" r="1.5" />
      <circle cx="8" cy="12" fill="currentColor" r="1.5" />
      <circle cx="8" cy="17" fill="currentColor" r="1.5" />
      <circle cx="16" cy="7" fill="currentColor" r="1.5" />
      <circle cx="16" cy="12" fill="currentColor" r="1.5" />
      <circle cx="16" cy="17" fill="currentColor" r="1.5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <path d="M4 20h4l9.5-9.5-4-4L4 16v4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m12.5 7.5 4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <path d="M5 7h14M10 11v6m4-6v6M9 4h6l1 3H8l1-3Zm-1 3h10l-.7 11.2A2 2 0 0 1 15.3 20H8.7a2 2 0 0 1-2-1.8L6 7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
