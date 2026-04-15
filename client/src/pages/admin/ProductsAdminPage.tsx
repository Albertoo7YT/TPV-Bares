import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Spinner from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";
import { getStoredToken } from "../../services/tokenStorage";

type Category = {
  id: string;
  name: string;
  order: number;
  active: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | string;
  available: boolean;
  categoryId: string;
  category: { id: string; name: string };
  productIngredients?: Array<{
    ingredientId: string;
    isDefault: boolean;
    ingredient: Ingredient;
  }>;
};

type ProductFormState = {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  available: boolean;
  imageUrl: string | null;
  ingredientSelections: Record<string, boolean>;
};

type Ingredient = {
  id: string;
  name: string;
  category: "BASE" | "SAUCE" | "EXTRA" | "TOPPING";
  extraPrice: number | string;
  available: boolean;
  order: number;
};

type FormErrors = Partial<Record<"name" | "description" | "price" | "categoryId" | "image", string>>;

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

export default function ProductsAdminPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");
  const [productModal, setProductModal] = useState<ProductFormState | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [nextCategories, nextProducts, nextIngredients] = await Promise.all([
        api.get<Category[]>("/categories/all"),
        api.get<Product[]>("/products/all"),
        api.get<Ingredient[]>("/ingredients")
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
      setIngredients(nextIngredients);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudo cargar la carta";
      setError(message);
      showToast({ type: "error", title: "Productos", message });
    } finally {
      setLoading(false);
    }
  }

  const activeCategories = useMemo(
    () =>
      [...categories]
        .filter((category) => category.active)
        .sort((left, right) => left.order - right.order),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        activeCategoryFilter === "all" || product.categoryId === activeCategoryFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.description ?? "").toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategoryFilter, products, searchTerm]);

  function openCreateModal() {
    setFormErrors({});
    setProductModal({
      name: "",
      description: "",
      price: "",
      categoryId: activeCategories[0]?.id ?? "",
      available: true,
      imageUrl: null,
      ingredientSelections: {}
    });
  }

  function openEditModal(product: Product) {
    setFormErrors({});
    setProductModal({
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      categoryId: product.categoryId,
      available: product.available,
      imageUrl: product.imageUrl,
      ingredientSelections: Object.fromEntries(
        (product.productIngredients ?? []).map((entry) => [entry.ingredientId, entry.isDefault])
      )
    });
  }

  function validateForm(form: ProductFormState) {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "El nombre es obligatorio";
    }

    if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = "La descripcion no puede superar 200 caracteres";
    }

    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      nextErrors.price = "Introduce un precio valido";
    }

    if (!form.categoryId) {
      nextErrors.categoryId = "Selecciona una categoria";
    }

    return nextErrors;
  }

  async function handleSaveProduct() {
    if (!productModal) {
      return;
    }

    const nextErrors = validateForm(productModal);
    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: productModal.name.trim(),
        description: productModal.description.trim() || null,
        imageUrl: productModal.imageUrl,
        price: Number(productModal.price),
        categoryId: productModal.categoryId,
        available: productModal.available
      };

      let productId = productModal.id ?? null;

      if (productModal.id) {
        await api.put(`/products/${productModal.id}`, payload);
        productId = productModal.id;
        showToast({ type: "success", title: "Productos", message: "Producto actualizado" });
      } else {
        const created = await api.post<Product>("/products", payload);
        productId = created.id;
        showToast({ type: "success", title: "Productos", message: "Producto creado" });
      }

      if (productId) {
        await api.put(
          `/products/${productId}/ingredients`,
          Object.entries(productModal.ingredientSelections).map(([ingredientId, isDefault]) => ({
            ingredientId,
            isDefault
          }))
        );
      }

      setProductModal(null);
      await loadData();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "No se pudo guardar el producto";
      setError(message);
      showToast({ type: "error", title: "Productos", message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductAvailability(product: Product) {
    try {
      await api.patch(`/products/${product.id}/toggle`);
      await loadData();
    } catch (toggleError) {
      const message =
        toggleError instanceof Error
          ? toggleError.message
          : "No se pudo cambiar la disponibilidad";
      setError(message);
      showToast({ type: "error", title: "Productos", message });
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Eliminar producto "${product.name}"?`)) {
      return;
    }

    try {
      await api.delete(`/products/${product.id}`);
      showToast({ type: "success", title: "Productos", message: "Producto eliminado" });
      await loadData();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el producto";
      setError(message);
      showToast({ type: "error", title: "Productos", message });
    }
  }

  async function processImageFile(file: File) {
    if (!productModal) {
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      const message = "Solo se permiten archivos JPG, PNG o WebP";
      setFormErrors((current) => ({ ...current, image: message }));
      return;
    }

    setUploadingImage(true);
    setFormErrors((current) => ({ ...current, image: undefined }));

    try {
      const blob = await resizeImage(file);

      if (blob.size > MAX_IMAGE_SIZE) {
        throw new Error("La imagen final supera 2MB");
      }

      const formData = new FormData();
      formData.append("image", new File([blob], file.name, { type: blob.type || file.type }));
      formData.append("productId", productModal.id ?? `temp_${Date.now()}`);

      const token = getStoredToken();
      const response = await fetch(buildApiUrl("/upload/image"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "No se pudo subir la imagen");
      }

      const payload = (await response.json()) as { url: string };

      setProductModal((current) =>
        current
          ? {
              ...current,
              imageUrl: payload.url
            }
          : current
      );
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "No se pudo procesar la imagen";
      setFormErrors((current) => ({ ...current, image: message }));
    } finally {
      setUploadingImage(false);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void processImageFile(file);
    }

    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processImageFile(file);
    }
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Productos</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Gestiona la carta de tu restaurante
          </p>
        </div>

        <button
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
          onClick={openCreateModal}
          type="button"
        >
          <span className="text-base">+</span>
          Nuevo producto
        </button>
      </header>

      <div className="surface-card p-4 md:p-5">
          <div className="flex overflow-hidden rounded-xl border border-[var(--color-border)] bg-white transition-all duration-200 focus-within:border-[rgba(232,93,42,0.65)] focus-within:shadow-[0_0_0_4px_rgba(232,93,42,0.12)]">
            <span className="flex w-12 shrink-0 items-center justify-center border-r border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
              <SearchIcon />
            </span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-[var(--color-text)] outline-none"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar productos por nombre"
              value={searchTerm}
            />
          </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeCategoryFilter === "all"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[#efede8] text-[#57534e]"
            }`}
            onClick={() => setActiveCategoryFilter("all")}
            type="button"
          >
            Todas
          </button>
          {activeCategories.map((category) => (
            <button
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeCategoryFilter === category.id
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[#efede8] text-[#57534e]"
              }`}
              key={category.id}
              onClick={() => setActiveCategoryFilter(category.id)}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="surface-card overflow-hidden" key={index}>
              <div className="aspect-[4/3] animate-pulse bg-[var(--color-surface-muted)]" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--color-surface-muted)]" />
                <div className="h-4 w-full animate-pulse rounded bg-[var(--color-surface-muted)]" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-muted)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <p className="text-base font-semibold text-[var(--color-text)]">No se han encontrado productos</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Ajusta el filtro o crea un producto nuevo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <article className="surface-card relative overflow-hidden" key={product.id}>
              <div className="relative aspect-[4/3] bg-[var(--color-surface-muted)]">
                {product.imageUrl ? (
                  <img
                    alt={product.name}
                    className="h-full w-full object-cover"
                    src={buildAssetUrl(product.imageUrl)}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--color-text-muted)]">
                    <CameraIcon />
                    <span className="text-sm font-medium">Sin foto</span>
                  </div>
                )}

                {!product.available ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-[var(--color-text)]">
                      No disponible
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <p className="text-base font-medium text-[var(--color-text)]">{product.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                    {product.description || "Sin descripcion"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="mono text-lg font-bold text-[var(--color-primary)]">
                    {formatCurrency(toNumber(product.price))}
                  </span>
                  <span className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                    {product.category.name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    aria-label={`Cambiar disponibilidad de ${product.name}`}
                    className={`relative h-7 w-12 rounded-full transition-all duration-200 ${
                      product.available ? "bg-emerald-500" : "bg-[#ddd6cb]"
                    }`}
                    onClick={() => void toggleProductAvailability(product)}
                    type="button"
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                        product.available ? "left-6" : "left-1"
                      }`}
                    />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Editar ${product.name}`}
                      className="btn-ghost inline-flex h-10 w-10 items-center justify-center rounded-xl"
                      onClick={() => openEditModal(product)}
                      type="button"
                    >
                      <EditIcon />
                    </button>
                    <button
                      aria-label={`Eliminar ${product.name}`}
                      className="btn-danger inline-flex h-10 w-10 items-center justify-center rounded-xl"
                      onClick={() => void deleteProduct(product)}
                      type="button"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {productModal ? (
        <ModalCard onClose={() => setProductModal(null)} title={productModal.id ? "Editar producto" : "Nuevo producto"}>
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <p className="text-sm font-medium text-[var(--color-text)]">Foto del producto</p>
              <button
                className={`flex min-h-72 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-center transition-all duration-200 ${
                  formErrors.image
                    ? "border-red-300 bg-red-50"
                    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-white"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                type="button"
              >
                {productModal.imageUrl ? (
                  <img
                    alt="Preview del producto"
                    className="max-h-60 w-full rounded-xl object-cover"
                    src={buildAssetUrl(productModal.imageUrl)}
                  />
                ) : (
                  <>
                    <UploadIcon />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Arrastra una foto o haz clic para subir
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        JPG, PNG o WebP · max 2MB · redimensionado a 800x800
                      </p>
                    </div>
                  </>
                )}
              </button>

              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
                ref={fileInputRef}
                type="file"
              />

              {formErrors.image ? (
                <p className="text-sm text-[var(--color-danger)]">{formErrors.image}</p>
              ) : null}

              <div className="flex gap-3">
                <button
                  className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {uploadingImage ? <Spinner className="h-4 w-4" label="Subiendo" /> : "Subir foto"}
                </button>
                {productModal.imageUrl ? (
                  <button
                    className="btn-danger min-h-11 px-4 py-2.5 text-sm font-medium"
                    onClick={() =>
                      setProductModal((current) =>
                        current ? { ...current, imageUrl: null } : current
                      )
                    }
                    type="button"
                  >
                    Eliminar foto
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Nombre" required>
                <input
                  className={getFieldClass(Boolean(formErrors.name))}
                  onChange={(event) =>
                    setProductModal((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  placeholder="Nombre del producto"
                  value={productModal.name}
                />
                {formErrors.name ? <FieldError message={formErrors.name} /> : null}
              </Field>

              <Field label="Descripcion">
                <textarea
                  className={getFieldClass(Boolean(formErrors.description), "min-h-28")}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  onChange={(event) =>
                    setProductModal((current) =>
                      current
                        ? {
                            ...current,
                            description: event.target.value.slice(0, MAX_DESCRIPTION_LENGTH)
                          }
                        : current
                    )
                  }
                  placeholder="Descripcion opcional"
                  value={productModal.description}
                />
                <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>{formErrors.description ?? ""}</span>
                  <span>{productModal.description.length}/{MAX_DESCRIPTION_LENGTH}</span>
                </div>
              </Field>

              <Field label="Precio" required>
                <div
                  className={`flex overflow-hidden rounded-xl border bg-white transition-all duration-200 ${
                    formErrors.price
                      ? "border-red-300 bg-red-50"
                      : "border-[var(--color-border)]"
                  } focus-within:border-[rgba(232,93,42,0.65)] focus-within:shadow-[0_0_0_4px_rgba(232,93,42,0.12)]`}
                >
                  <span className="flex w-12 shrink-0 items-center justify-center border-r border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-muted)]">
                    €
                  </span>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-[var(--color-text)] outline-none"
                    inputMode="decimal"
                    onChange={(event) =>
                      setProductModal((current) =>
                        current
                          ? {
                              ...current,
                              price: event.target.value.replace(",", ".")
                            }
                          : current
                      )
                    }
                    placeholder="0.00"
                    value={productModal.price}
                  />
                </div>
                {formErrors.price ? <FieldError message={formErrors.price} /> : null}
              </Field>

              <Field label="Categoria" required>
                <select
                  className={getFieldClass(Boolean(formErrors.categoryId))}
                  onChange={(event) =>
                    setProductModal((current) =>
                      current ? { ...current, categoryId: event.target.value } : current
                    )
                  }
                  value={productModal.categoryId}
                >
                  <option value="">Selecciona categoria</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {formErrors.categoryId ? <FieldError message={formErrors.categoryId} /> : null}
              </Field>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">Disponible</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Si esta desactivado, no aparece en la carta de sala.
                    </p>
                  </div>
                  <button
                    aria-label="Cambiar disponibilidad"
                    className={`relative h-7 w-12 rounded-full transition-all duration-200 ${
                      productModal.available ? "bg-emerald-500" : "bg-[#ddd6cb]"
                    }`}
                    onClick={() =>
                      setProductModal((current) =>
                        current ? { ...current, available: !current.available } : current
                      )
                    }
                    type="button"
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                        productModal.available ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-[var(--color-text)]">Ingredientes</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Marca los ingredientes que forman parte del producto. Si no se marca, seguirá disponible como extra opcional.
                  </p>
                </div>

                <div className="space-y-4">
                  {(["BASE", "SAUCE", "TOPPING", "EXTRA"] as const).map((category) => {
                    const categoryIngredients = ingredients.filter(
                      (ingredient) => ingredient.category === category && ingredient.available
                    );

                    if (categoryIngredients.length === 0) {
                      return null;
                    }

                    return (
                      <div key={category}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                          {category}
                        </p>
                        <div className="space-y-2">
                          {categoryIngredients.map((ingredient) => {
                            const checked = Boolean(productModal.ingredientSelections[ingredient.id]);
                            return (
                              <label
                                key={ingredient.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2"
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    checked={checked}
                                    onChange={() =>
                                      setProductModal((current) =>
                                        current
                                          ? {
                                              ...current,
                                              ingredientSelections: checked
                                                ? Object.fromEntries(
                                                    Object.entries(current.ingredientSelections).filter(
                                                      ([id]) => id !== ingredient.id
                                                    )
                                                  )
                                                : {
                                                    ...current.ingredientSelections,
                                                    [ingredient.id]: true
                                                  }
                                            }
                                          : current
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <div>
                                    <p className="text-sm font-medium text-[var(--color-text)]">
                                      {ingredient.name}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                      {checked ? "Incluido por defecto" : "Extra opcional"}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                                  {formatCurrency(toNumber(ingredient.extraPrice))}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setProductModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-primary min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving || uploadingImage}
              onClick={() => void handleSaveProduct()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar producto"}
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

function FieldError(props: { message: string }) {
  return <p className="mt-1 text-sm text-[var(--color-danger)]">{props.message}</p>;
}

function ModalCard(props: { title: string; children: ReactNode; onClose: () => void }) {
  const { title, children, onClose } = props;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-end md:items-center md:justify-center">
        <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
            <button className="btn-ghost min-h-11 px-3 py-2 text-sm" onClick={onClose} type="button">
              Cerrar
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function buildApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return `${apiBaseUrl}${path}`;
  }

  return `${apiBaseUrl}${path}`;
}

function buildAssetUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return new URL(path, apiBaseUrl).toString();
  }

  return path;
}

function getFieldClass(hasError: boolean, extraClassName = "") {
  return `field-input ${extraClassName} ${hasError ? "border-red-300 bg-red-50" : ""}`.trim();
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolvePromise, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("No se pudo preparar la imagen"));
        return;
      }

      const maxSize = 800;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);

          if (!blob) {
            reject(new Error("No se pudo convertir la imagen"));
            return;
          }

          resolvePromise(blob);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        0.88
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo cargar la imagen"));
    };

    image.src = objectUrl;
  });
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <path d="m20 20-4.2-4.2M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24">
      <path d="M9 5h6l1.2 2H20a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h3.8L9 5Zm3 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-10 w-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24">
      <path d="M12 16V6m0 0-4 4m4-4 4 4M5 17.5v.5A2 2 0 0 0 7 20h10a2 2 0 0 0 2-2v-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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
