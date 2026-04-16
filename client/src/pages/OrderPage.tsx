import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Skeleton from "../components/Skeleton";
import Spinner from "../components/Spinner";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";

type IngredientCategory = "BASE" | "SAUCE" | "EXTRA" | "TOPPING";
type ModificationAction = "REMOVED" | "ADDED";

type ProductIngredient = {
  ingredientId: string;
  isDefault: boolean;
  ingredient: {
    id: string;
    name: string;
    category: IngredientCategory;
    extraPrice: number | string;
    available: boolean;
    order: number;
  };
};

type MenuProduct = {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  available?: boolean;
  productIngredients?: ProductIngredient[];
};

type MenuCategory = { id: string; name: string; order: number; products: MenuProduct[] };

type OrderItemModificationResponse = {
  id: string;
  action: ModificationAction;
  extraPrice: number | string;
  ingredient: { id: string; name: string };
};

type OrderItemResponse = {
  id: string;
  quantity: number;
  notes: string | null;
  unitPrice: number | string;
  product: { id: string; name: string };
  modifications?: OrderItemModificationResponse[];
};

type OrderResponse = {
  id: string;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
  waiter?: { id: string; name: string; role: string } | null;
  items: OrderItemResponse[];
};

type TableResponse = { id: string; number: number; name: string | null };
type TableListResponse = { tables: TableResponse[] };

type CartModification = {
  ingredientId: string;
  name: string;
  action: ModificationAction;
  extraPrice: number;
};

type CartItem = {
  id: string;
  sourceItemId?: string;
  productId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  modifications: CartModification[];
};

type CustomizationModalState = {
  product: MenuProduct;
  removedIngredientIds: string[];
  addedIngredientIds: string[];
  cartItemId?: string;
};

const tabs = ["Carta", "Pedido actual"] as const;

export default function OrderPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { showToast } = useToast();
  const tableId = params.tableId ?? "";
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<(typeof tabs)[number]>("Carta");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [previousOrders, setPreviousOrders] = useState<OrderResponse[]>([]);
  const [table, setTable] = useState<TableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [noteModalItemId, setNoteModalItemId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [customizationModal, setCustomizationModal] = useState<CustomizationModalState | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<CartItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [menuData, ordersData, tablesData] = await Promise.all([
          api.get<MenuCategory[]>("/products"),
          api.get<OrderResponse[]>(`/orders/table/${tableId}`),
          api.get<TableListResponse>("/tables")
        ]);

        if (cancelled) return;

        setCategories(menuData);
        setActiveCategoryId(menuData[0]?.id ?? null);
        setPreviousOrders(ordersData);
        setTable(tablesData.tables.find((item) => item.id === tableId) ?? null);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "No se pudo cargar la pantalla de pedido";
        if (!cancelled) {
          setError(message);
          showToast({ type: "error", title: "Pedido", message });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (tableId) void loadData();

    return () => {
      cancelled = true;
    };
  }, [showToast, tableId]);

  useEffect(() => {
    if (!socket || !tableId) return;

    async function refreshOrders() {
      try {
        const ordersData = await api.get<OrderResponse[]>(`/orders/table/${tableId}`);
        setPreviousOrders(ordersData);
      } catch {
        // ignore transient refresh failures
      }
    }

    socket.on("order:new", refreshOrders);
    socket.on("order:updated", refreshOrders);
    socket.on("order:cancelled", refreshOrders);
    socket.on("bill:created", refreshOrders);

    return () => {
      socket.off("order:new", refreshOrders);
      socket.off("order:updated", refreshOrders);
      socket.off("order:cancelled", refreshOrders);
      socket.off("bill:created", refreshOrders);
    };
  }, [socket, tableId]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0] ?? null;
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart]);
  const noteItem = cart.find((item) => item.id === noteModalItemId) ?? null;
  const customizationSummary = useMemo(() => {
    if (!customizationModal) return null;

    const defaultIngredients = (customizationModal.product.productIngredients ?? []).filter((entry) => entry.isDefault);
    const extraIngredients = (customizationModal.product.productIngredients ?? []).filter((entry) => !entry.isDefault);
    const removed = defaultIngredients.filter((entry) =>
      customizationModal.removedIngredientIds.includes(entry.ingredientId)
    );
    const added = extraIngredients.filter((entry) =>
      customizationModal.addedIngredientIds.includes(entry.ingredientId)
    );
    const basePrice = toNumber(customizationModal.product.price);
    const extrasTotal = added.reduce(
      (sum, entry) => sum + toNumber(entry.ingredient.extraPrice),
      0
    );

    return {
      removed,
      added,
      basePrice,
      extrasTotal,
      total: basePrice + extrasTotal
    };
  }, [customizationModal]);

  function buildCartItemFromOrderItem(item: OrderItemResponse): CartItem {
    const modifications = (item.modifications ?? []).map((modification) => ({
      ingredientId: modification.ingredient.id,
      name: modification.ingredient.name,
      action: modification.action,
      extraPrice: toNumber(modification.extraPrice)
    }));
    const extrasTotal = modifications
      .filter((modification) => modification.action === "ADDED")
      .reduce((sum, modification) => sum + modification.extraPrice, 0);

    return {
      id: crypto.randomUUID(),
      sourceItemId: item.id,
      productId: item.product.id,
      name: item.product.name,
      basePrice: Math.max(0, toNumber(item.unitPrice) - extrasTotal),
      unitPrice: toNumber(item.unitPrice),
      quantity: item.quantity,
      notes: item.notes,
      modifications
    };
  }

  function normalizeCartModificationSignature(modification: CartModification) {
    return `${modification.action}:${modification.ingredientId}`;
  }

  function haveCartItemsChanged(currentItem: CartItem, originalItem: CartItem) {
    if (currentItem.quantity !== originalItem.quantity) return true;
    if ((currentItem.notes ?? "") !== (originalItem.notes ?? "")) return true;

    const currentMods = [...currentItem.modifications]
      .sort((left, right) => normalizeCartModificationSignature(left).localeCompare(normalizeCartModificationSignature(right)))
      .map(normalizeCartModificationSignature);
    const originalMods = [...originalItem.modifications]
      .sort((left, right) => normalizeCartModificationSignature(left).localeCompare(normalizeCartModificationSignature(right)))
      .map(normalizeCartModificationSignature);

    return currentMods.join("|") !== originalMods.join("|");
  }

  function addSimpleProduct(product: MenuProduct) {
    const price = toNumber(product.price);
    const simpleItem = cart.find(
      (item) =>
        item.productId === product.id &&
        item.modifications.length === 0 &&
        !item.notes
    );

    if (simpleItem) {
      setCart((currentCart) =>
        currentCart.map((item) =>
          item.id === simpleItem.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setCart((currentCart) => [
        ...currentCart,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          basePrice: price,
          unitPrice: price,
          quantity: 1,
          notes: null,
          modifications: []
        }
      ]);
    }

    setHighlightedProductId(product.id);
    window.setTimeout(() => setHighlightedProductId(null), 220);
  }

  function adjustProductQuantity(product: MenuProduct, delta: 1 | -1) {
    const count = cart.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);

    if (delta > 0) {
      if ((product.productIngredients?.length ?? 0) > 0) {
        setCustomizationModal({
          product,
          removedIngredientIds: [],
          addedIngredientIds: []
        });
        return;
      }

      addSimpleProduct(product);
      return;
    }

    if (count <= 0) return;

    setCart((currentCart) => {
      const reversedIndex = [...currentCart]
        .reverse()
        .findIndex((item) => item.productId === product.id);

      if (reversedIndex === -1) return currentCart;

      const actualIndex = currentCart.length - 1 - reversedIndex;
      const target = currentCart[actualIndex];

      if (!target) {
        return currentCart;
      }

      if (target.quantity <= 1) {
        return currentCart.filter((item) => item.id !== target.id);
      }

      return currentCart.map((item) =>
        item.id === target.id ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  }

  function updateCartItemQuantity(itemId: string, delta: 1 | -1) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function openNotesModal(itemId: string) {
    const target = cart.find((item) => item.id === itemId);
    setNoteDraft(target?.notes ?? "");
    setNoteModalItemId(itemId);
  }

  function saveNotes() {
    if (!noteModalItemId) return;

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.id === noteModalItemId ? { ...item, notes: noteDraft.trim() || null } : item
      )
    );
    setNoteModalItemId(null);
    setNoteDraft("");
  }

  function toggleCustomizationIngredient(ingredientId: string, type: "removed" | "added") {
    setCustomizationModal((current) => {
      if (!current) return current;

      const key = type === "removed" ? "removedIngredientIds" : "addedIngredientIds";
      const currentValues = current[key];

      return {
        ...current,
        [key]: currentValues.includes(ingredientId)
          ? currentValues.filter((value) => value !== ingredientId)
          : [...currentValues, ingredientId]
      };
    });
  }

  function openCustomizationForCartItem(itemId: string) {
    const cartItem = cart.find((entry) => entry.id === itemId);
    if (!cartItem) return;

    const product =
      categories.flatMap((category) => category.products).find((entry) => entry.id === cartItem.productId) ?? null;

    if (!product || (product.productIngredients?.length ?? 0) === 0) {
      return;
    }

    setCustomizationModal({
      product,
      cartItemId: cartItem.id,
      removedIngredientIds: cartItem.modifications
        .filter((modification) => modification.action === "REMOVED")
        .map((modification) => modification.ingredientId),
      addedIngredientIds: cartItem.modifications
        .filter((modification) => modification.action === "ADDED")
        .map((modification) => modification.ingredientId)
    });
  }

  function addCustomizedProduct() {
    if (!customizationModal || !customizationSummary) return;

    const modifications: CartModification[] = [
      ...customizationSummary.removed.map((entry) => ({
        ingredientId: entry.ingredientId,
        name: entry.ingredient.name,
        action: "REMOVED" as const,
        extraPrice: 0
      })),
      ...customizationSummary.added.map((entry) => ({
        ingredientId: entry.ingredientId,
        name: entry.ingredient.name,
        action: "ADDED" as const,
        extraPrice: toNumber(entry.ingredient.extraPrice)
      }))
    ];

    if (customizationModal.cartItemId) {
      setCart((currentCart) =>
        currentCart.map((item) =>
          item.id === customizationModal.cartItemId
            ? {
                ...item,
                basePrice: customizationSummary.basePrice,
                unitPrice: customizationSummary.total,
                modifications
              }
            : item
        )
      );
    } else {
      setCart((currentCart) => [
        ...currentCart,
        {
          id: crypto.randomUUID(),
          productId: customizationModal.product.id,
          name: customizationModal.product.name,
          basePrice: customizationSummary.basePrice,
          unitPrice: customizationSummary.total,
          quantity: 1,
          notes: null,
          modifications
        }
      ]);
    }

    setCustomizationModal(null);
    setHighlightedProductId(customizationModal.product.id);
    window.setTimeout(() => setHighlightedProductId(null), 220);
  }

  async function handleSendOrder() {
    if (!cart.length || !tableId) return;

    setSending(true);
    setError(null);

    try {
      if (editingOrderId) {
        if (cart.length === 0) {
          await api.delete(`/orders/${editingOrderId}`);
        } else {
          const originalByItemId = new Map(
            editingSnapshot
              .filter((item) => item.sourceItemId)
              .map((item) => [item.sourceItemId!, item])
          );
          const currentByItemId = new Map(
            cart
              .filter((item) => item.sourceItemId)
              .map((item) => [item.sourceItemId!, item])
          );

          const removedItemIds = [...originalByItemId.keys()].filter((itemId) => !currentByItemId.has(itemId));
          const changedItems = [...currentByItemId.entries()]
            .filter(([itemId, item]) => {
              const originalItem = originalByItemId.get(itemId);
              return originalItem ? haveCartItemsChanged(item, originalItem) : false;
            })
            .map(([itemId, item]) => ({ itemId, item }));
          const newItems = cart.filter((item) => !item.sourceItemId);

          for (const itemId of removedItemIds) {
            await api.delete(`/orders/${editingOrderId}/items/${itemId}`);
          }

          for (const { itemId, item } of changedItems) {
            await api.patch(`/orders/${editingOrderId}/items/${itemId}`, {
              quantity: item.quantity,
              notes: item.notes,
              modifications: item.modifications.map((modification) => ({
                ingredientId: modification.ingredientId,
                action: modification.action
              }))
            });
          }

          if (newItems.length > 0) {
            await api.post(`/orders/${editingOrderId}/items`, {
              items: newItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                notes: item.notes,
                modifications: item.modifications.map((modification) => ({
                  ingredientId: modification.ingredientId,
                  action: modification.action
                }))
              }))
            });
          }
        }

        const refreshedOrders = await api.get<OrderResponse[]>(`/orders/table/${tableId}`);
        setPreviousOrders(refreshedOrders);
        setCart([]);
        setEditingOrderId(null);
        setEditingSnapshot([]);
        setCurrentTab("Carta");
        showToast({ type: "success", title: "Pedido", message: "Pedido actualizado" });
      } else {
        await api.post("/orders", {
          tableId,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
            modifications: item.modifications.map((modification) => ({
              ingredientId: modification.ingredientId,
              action: modification.action
            }))
          }))
        });

        const refreshedOrders = await api.get<OrderResponse[]>(`/orders/table/${tableId}`);
        setPreviousOrders(refreshedOrders);
        setCart([]);
        setCurrentTab("Carta");
        showToast({ type: "success", title: "Pedido", message: "Pedido enviado" });
      }
    } catch (sendError) {
      const message =
        sendError instanceof Error
          ? sendError.message
          : editingOrderId
            ? "No se pudo actualizar el pedido"
            : "No se pudo enviar el pedido";
      setError(message);
      showToast({ type: "error", title: "Pedido", message });
    } finally {
      setSending(false);
    }
  }

  function handleEditOrder(order: OrderResponse) {
    const nextCart = order.items.map(buildCartItemFromOrderItem);
    setEditingOrderId(order.id);
    setEditingSnapshot(nextCart);
    setCart(nextCart);
    setError(null);
  }

  function handleCancelEditing() {
    setEditingOrderId(null);
    setEditingSnapshot([]);
    setCart([]);
    setCurrentTab("Carta");
    setCustomizationModal(null);
    setNoteModalItemId(null);
    setNoteDraft("");
  }

  async function handleCancelOrder(orderId: string) {
    if (!window.confirm("¿Cancelar este pedido?")) {
      return;
    }

    setCancellingOrderId(orderId);

    try {
      await api.delete(`/orders/${orderId}`);
      const refreshedOrders = await api.get<OrderResponse[]>(`/orders/table/${tableId}`);
      setPreviousOrders(refreshedOrders);
      if (editingOrderId === orderId) {
        handleCancelEditing();
      }
      showToast({ type: "success", title: "Pedido", message: "Pedido cancelado" });
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "No se pudo cancelar el pedido";
      showToast({ type: "error", title: "Pedido", message });
    } finally {
      setCancellingOrderId(null);
    }
  }

  return (
    <section className="space-y-4 pb-32">
      <header className="sticky top-[73px] z-20 -mx-4 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{table ? `Mesa ${table.number}` : "Mesa"}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{table?.name ?? "Toma de pedido"}</p>
          </div>
          <button aria-label="Ver cuenta de la mesa" className="btn-secondary px-4 py-2.5 text-sm font-medium" onClick={() => navigate(`/bill/${tableId}`)} type="button">Ver cuenta</button>
        </div>
      </header>

      <div className="surface-card flex p-1">
        {tabs.map((tab) => (
          <button key={tab} aria-label={`Abrir tab ${tab}`} className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${currentTab === tab ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`} onClick={() => setCurrentTab(tab)} type="button">{tab}</button>
        ))}
      </div>

      {error ? <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div> : null}

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="surface-card p-5" key={index}>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-2 h-4 w-48" />
            </div>
          ))}
        </div>
      ) : currentTab === "Carta" ? (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button key={category.id} aria-label={`Filtrar por ${category.name}`} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${activeCategory?.id === category.id ? "bg-[var(--color-primary)] text-white" : "bg-[#efede8] text-[var(--color-text-muted)]"}`} onClick={() => setActiveCategoryId(category.id)} type="button">{category.name}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {activeCategory?.products.map((product) => {
              const inCartCount = cart.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              const available = product.available ?? true;

              return (
                <article key={product.id} className={`flex min-h-[70px] rounded-xl border border-[#E5E2DC] bg-white p-3 transition-all duration-200 ${highlightedProductId === product.id ? "bg-orange-50 shadow-sm" : ""} ${available ? "" : "opacity-40"}`}>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium text-[var(--color-text)]">{product.name}</h2>
                      <p className="mt-2 text-sm font-bold text-[var(--color-primary)]">{formatCurrency(toNumber(product.price))}</p>
                      {!available ? <p className="mt-1 text-xs font-medium text-red-600">Agotado</p> : null}
                    </div>

                    {available ? (
                      <button
                        aria-label={`Añadir ${product.name}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white transition-all duration-200 hover:bg-[var(--color-primary-hover)]"
                        onClick={() => adjustProductQuantity(product, 1)}
                        type="button"
                      >
                        {inCartCount > 0 ? inCartCount : "+"}
                      </button>
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dfd8ce] text-sm font-semibold text-[#9c9388]">
                        +
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {editingOrderId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Editando pedido enviado</p>
                  <p className="mt-1 text-sm text-amber-800">Los cambios se guardarán sobre el pedido ya enviado.</p>
                </div>
                <button className="btn-secondary px-3 py-2 text-xs font-medium" onClick={handleCancelEditing} type="button">
                  Cancelar edición
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {cart.length === 0 ? <div className="surface-card px-5 py-4 text-sm text-[var(--color-text-muted)]">Aun no has añadido productos al pedido actual.</div> : cart.map((item) => (
              <article className="surface-card p-5" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">{item.name}</h2>
                    <div className="mt-1 space-y-1">
                      {item.modifications.map((modification) => (
                        <p key={`${item.id}-${modification.ingredientId}-${modification.action}`} className={`text-sm ${modification.action === "REMOVED" ? "text-red-600" : "text-emerald-700"}`}>
                          {modification.action === "REMOVED" ? `SIN ${modification.name}` : `+ ${modification.name}`}
                        </p>
                      ))}
                      {item.notes ? <p className="rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-700">Nota: {item.notes}</p> : null}
                    </div>
                    <p className="mt-3 text-sm text-[var(--color-text-muted)]">{formatCurrency(item.unitPrice)} / unidad</p>
                  </div>
                  <div className="text-right">
                    <p className="mono text-lg text-[var(--color-text)]">{formatCurrency(item.unitPrice * item.quantity)}</p>
                    <button aria-label={`${item.notes ? "Editar" : "Añadir"} nota a ${item.name}`} className="btn-ghost mt-2 px-2 py-1 text-xs font-medium" onClick={() => openNotesModal(item.id)} type="button">{item.notes ? "Editar nota" : "Añadir nota"}</button>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 rounded-full bg-[#f3f1ed] p-1">
                    <button aria-label={`Quitar una unidad de ${item.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-medium text-[var(--color-text)] shadow-sm" onClick={() => updateCartItemQuantity(item.id, -1)} type="button">−</button>
                    <span className="mono min-w-7 text-center text-lg text-[var(--color-text)]">{item.quantity}</span>
                    <button aria-label={`Añadir una unidad de ${item.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-xl font-medium text-white" onClick={() => updateCartItemQuantity(item.id, 1)} type="button">+</button>
                  </div>
                  <button aria-label={`Eliminar ${item.name} del pedido actual`} className="btn-danger px-4 py-2 text-xs font-medium" onClick={() => setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))} type="button">Eliminar</button>
                </div>
              </article>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Pedidos en esta mesa</h2>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            {previousOrders.length === 0 ? <div className="surface-card px-5 py-4 text-sm text-[var(--color-text-muted)]">Todavía no se ha enviado ningún pedido en esta mesa.</div> : (
              <div className="space-y-3">
                {previousOrders.map((order) => (
                  <article className="surface-card p-5" key={order.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-muted)]">Pedido {formatTime(order.createdAt)}</p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Camarero: {order.waiter?.name ?? "-"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="btn-secondary px-3 py-2 text-xs font-medium" onClick={() => handleEditOrder(order)} type="button">
                          Editar
                        </button>
                        <button
                          aria-label="Cancelar pedido"
                          className="btn-danger px-3 py-2 text-xs font-medium"
                          disabled={cancellingOrderId === order.id}
                          onClick={() => void handleCancelOrder(order.id)}
                          type="button"
                        >
                          {cancellingOrderId === order.id ? <Spinner className="h-4 w-4" label="Cancelando" /> : "Cancelar"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--color-text)]">{item.quantity} x {item.product.name}</p>
                            {(item.modifications ?? []).map((modification) => (
                              <p key={modification.id} className={modification.action === "REMOVED" ? "text-red-600" : "text-emerald-700"}>
                                {modification.action === "REMOVED" ? `SIN ${modification.ingredient.name}` : `+ ${modification.ingredient.name}`}
                              </p>
                            ))}
                            {item.notes ? <p className="text-[var(--color-text-muted)]">{item.notes}</p> : null}
                          </div>
                          <span className="text-[var(--color-text-muted)]">{formatCurrency(toNumber(item.unitPrice) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="surface-card fixed inset-x-0 bottom-20 border-t border-[var(--color-border)] bg-white px-4 pb-4 pt-3 md:bottom-0 md:left-auto md:right-4 md:max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">{editingOrderId ? "Total pedido editado" : "Total pedido actual"}</span>
              <span className="mono text-2xl text-[var(--color-text)]">{formatCurrency(total)}</span>
            </div>
            <button aria-label="Enviar pedido actual" className="btn-primary w-full px-5 py-4 text-base font-medium" disabled={!cart.length || sending} onClick={handleSendOrder} type="button">
              {sending ? <Spinner className="h-5 w-5" label={editingOrderId ? "Guardando..." : "Enviando..."} /> : editingOrderId ? "Guardar cambios" : "Enviar a cocina"}
            </button>
          </div>
        </div>
      )}

      {noteModalItemId && noteItem ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Nota para {noteItem.name}</h2>
              <button aria-label="Cerrar modal" className="btn-ghost h-9 w-9 rounded-full text-lg" onClick={() => setNoteModalItemId(null)} type="button">×</button>
            </div>
            <textarea className="field-input min-h-28 text-sm" onChange={(event) => setNoteDraft(event.target.value)} placeholder="sin cebolla, poco hecho, salsa aparte..." value={noteDraft} />
            <div className="mt-4 flex justify-end gap-3">
              <button aria-label="Cancelar edición de nota" className="btn-secondary px-4 py-2.5 text-sm font-medium" onClick={() => setNoteModalItemId(null)} type="button">Cancelar</button>
              <button aria-label="Guardar nota del producto" className="btn-primary px-4 py-2.5 text-sm font-medium" onClick={saveNotes} type="button">Guardar nota</button>
            </div>
          </div>
        </div>
      ) : null}

      {customizationModal && customizationSummary ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[var(--color-text)]">{customizationModal.product.name}</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Precio base: {formatCurrency(customizationSummary.basePrice)}
                </p>
              </div>
              <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setCustomizationModal(null)} type="button">
                Cerrar
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Ingredientes</h3>
                <div className="space-y-2">
                  {(customizationModal.product.productIngredients ?? [])
                    .filter((entry) => entry.isDefault)
                    .map((entry) => {
                      const disabled = customizationModal.removedIngredientIds.includes(entry.ingredientId);
                      return (
                        <label key={entry.ingredientId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2">
                          <div className="flex items-center gap-3">
                            <input checked={!disabled} onChange={() => toggleCustomizationIngredient(entry.ingredientId, "removed")} type="checkbox" />
                            <span className={`text-sm ${disabled ? "text-red-600 line-through" : "text-[var(--color-text)]"}`}>
                              {entry.ingredient.name}
                            </span>
                          </div>
                          {disabled ? <span className="text-xs font-medium text-red-600">SIN {entry.ingredient.name}</span> : null}
                        </label>
                      );
                    })}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Extras</h3>
                <div className="space-y-2">
                  {(customizationModal.product.productIngredients ?? [])
                    .filter((entry) => !entry.isDefault)
                    .map((entry) => {
                      const checked = customizationModal.addedIngredientIds.includes(entry.ingredientId);
                      return (
                        <label key={entry.ingredientId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2">
                          <div className="flex items-center gap-3">
                            <input checked={checked} onChange={() => toggleCustomizationIngredient(entry.ingredientId, "added")} type="checkbox" />
                            <span className="text-sm text-[var(--color-text)]">{entry.ingredient.name}</span>
                          </div>
                          <span className="text-sm font-medium text-emerald-700">+ {formatCurrency(toNumber(entry.ingredient.extraPrice))}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-sm text-[var(--color-text)]">
                {customizationModal.product.name}: {formatCurrency(customizationSummary.basePrice)}
                {customizationSummary.added.map((entry) => ` + ${entry.ingredient.name} ${formatCurrency(toNumber(entry.ingredient.extraPrice))}`).join("")}
                {" = "}
                <span className="font-semibold">{formatCurrency(customizationSummary.total)}</span>
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button className="btn-secondary px-4 py-2.5 text-sm" onClick={() => setCustomizationModal(null)} type="button">
                Cancelar
              </button>
              <button className="btn-primary px-4 py-2.5 text-sm font-semibold" onClick={addCustomizedProduct} type="button">
                Añadir al pedido
              </button>
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
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
