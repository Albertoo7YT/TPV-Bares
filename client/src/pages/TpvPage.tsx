import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";

type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";
type PaymentMethod = "CASH" | "CARD" | "MIXED";
type IngredientCategory = "BASE" | "SAUCE" | "EXTRA" | "TOPPING";
type ModificationAction = "REMOVED" | "ADDED";

type TableItem = {
  id: string;
  number: number;
  name: string | null;
  status: TableStatus;
  summary: {
    partialTotal: number;
    occupiedSince: string | null;
    openedBy: { id: string; name: string } | null;
    activeOrdersCount?: number;
  } | null;
};

type TableListResponse = { tables: TableItem[] };

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

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  imageUrl?: string | null;
  available?: boolean;
  productIngredients?: ProductIngredient[];
};

type Category = {
  id: string;
  name: string;
  order: number;
  products: Product[];
};

type OrderItemModification = {
  id: string;
  action: ModificationAction;
  extraPrice: number | string;
  ingredient: { id: string; name: string };
};

type OrderItem = {
  id: string;
  quantity: number;
  notes: string | null;
  unitPrice: number | string;
  product: { id: string; name: string };
  modifications?: OrderItemModification[];
};

type Order = {
  id: string;
  createdAt: string;
  waiter?: { id: string; name: string } | null;
  items: OrderItem[];
};

type BillPreview = {
  subtotal: number;
  tax: number;
  total: number;
  tableNumber: number;
};

type CustomizationModalState = {
  product: Product;
  removedIngredientIds: string[];
  addedIngredientIds: string[];
};

type GroupedConsumption = {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  total: number;
  notes: string[];
  modifications: string[];
  refs: Array<{
    orderId: string;
    itemId: string;
    quantity: number;
    notes: string | null;
    modifications: Array<{ ingredientId: string; action: ModificationAction }>;
  }>;
};

const paymentMethods: Array<{ key: PaymentMethod; label: string }> = [
  { key: "CASH", label: "Efectivo" },
  { key: "CARD", label: "Tarjeta" },
  { key: "MIXED", label: "Mixto" }
];

const tableStateStyles: Record<TableStatus, string> = {
  FREE: "border border-[#E5E2DC] bg-white",
  OCCUPIED: "border border-[#E85D2A] bg-[#FFF7ED]",
  RESERVED: "border border-blue-300 bg-blue-50"
};

const compactTableStateStyles: Record<TableStatus, string> = {
  FREE: "border border-[#E5E2DC] bg-white opacity-50",
  OCCUPIED: "border border-[#E85D2A] bg-[#FFF7ED]",
  RESERVED: "border border-blue-300 bg-blue-50"
};

export default function TpvPage() {
  const { socket } = useSocket();
  const { showToast } = useToast();
  const viewport = useViewportMode();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billPreview, setBillPreview] = useState<BillPreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [submittingBill, setSubmittingBill] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [customizationModal, setCustomizationModal] = useState<CustomizationModalState | null>(null);
  const [productSessionCounts, setProductSessionCounts] = useState<Record<string, number>>({});

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [tablesData, productsData] = await Promise.all([
          api.get<TableListResponse>("/tables"),
          api.get<Category[]>("/products")
        ]);

        if (cancelled) return;

        setTables(tablesData.tables);
        setCategories(productsData);
        setActiveCategoryId(productsData[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "TPV",
            message: error instanceof Error ? error.message : "No se pudo cargar el TPV"
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingTables(false);
          setLoadingProducts(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!selectedTableId) {
      setOrders([]);
      setEditingGroupKey(null);
      setBillingOpen(false);
      return;
    }

    let cancelled = false;

    async function loadOrders() {
      setLoadingOrders(true);
      try {
        const data = await api.get<Order[]>(`/orders/table/${selectedTableId}`);
        if (!cancelled) {
          setOrders(data);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: "error",
            title: "TPV",
            message: error instanceof Error ? error.message : "No se pudo cargar la mesa"
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingOrders(false);
        }
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, [selectedTableId, showToast]);

  useEffect(() => {
    if (!socket) return;

    async function refresh() {
      const tablesData = await api.get<TableListResponse>("/tables");
      setTables(tablesData.tables);

      if (selectedTableId) {
        setOrders(await api.get<Order[]>(`/orders/table/${selectedTableId}`));
      }
    }

    socket.on("table:statusChanged", () => void refresh());
    socket.on("order:new", () => void refresh());
    socket.on("order:updated", () => void refresh());
    socket.on("order:cancelled", () => void refresh());
    socket.on("bill:created", () => void refresh());

    return () => {
      socket.off("table:statusChanged");
      socket.off("order:new");
      socket.off("order:updated");
      socket.off("order:cancelled");
      socket.off("bill:created");
    };
  }, [selectedTableId, socket]);

  useEffect(() => {
    if (!editingGroupKey) return;

    const timeout = window.setTimeout(() => setEditingGroupKey(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [editingGroupKey]);

  const groupedConsumptions = useMemo<GroupedConsumption[]>(() => {
    const grouped = new Map<string, GroupedConsumption>();

    for (const order of orders) {
      for (const item of order.items) {
        const modifications = (item.modifications ?? [])
          .map((modification) =>
            modification.action === "REMOVED"
              ? `SIN ${modification.ingredient.name}`
              : `+ ${modification.ingredient.name}`
          )
          .sort();
        const signature = JSON.stringify({
          productId: item.product.id,
          unitPrice: toNumber(item.unitPrice),
          notes: item.notes ?? "",
          modifications
        });
        const total = item.quantity * toNumber(item.unitPrice);
        const current = grouped.get(signature);

        if (current) {
          current.quantity += item.quantity;
          current.total += total;
          current.refs.push({
            orderId: order.id,
            itemId: item.id,
            quantity: item.quantity,
            notes: item.notes,
            modifications: (item.modifications ?? []).map((modification) => ({
              ingredientId: modification.ingredient.id,
              action: modification.action
            }))
          });
          continue;
        }

        grouped.set(signature, {
          key: signature,
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          total,
          notes: item.notes ? [item.notes] : [],
          modifications,
          refs: [
            {
              orderId: order.id,
              itemId: item.id,
              quantity: item.quantity,
              notes: item.notes,
              modifications: (item.modifications ?? []).map((modification) => ({
                ingredientId: modification.ingredient.id,
                action: modification.action
              }))
            }
          ]
        });
      }
    }

    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, "es"));
  }, [orders]);

  const totals = useMemo(() => {
    const total = groupedConsumptions.reduce((sum, item) => sum + item.total, 0);
    const subtotal = total / 1.1;
    const tax = total - subtotal;
    return { subtotal, tax, total };
  }, [groupedConsumptions]);

  const customizationSummary = useMemo(() => {
    if (!customizationModal) return null;

    const defaults = (customizationModal.product.productIngredients ?? []).filter((entry) => entry.isDefault);
    const extras = (customizationModal.product.productIngredients ?? []).filter((entry) => !entry.isDefault);
    const removed = defaults.filter((entry) => customizationModal.removedIngredientIds.includes(entry.ingredientId));
    const added = extras.filter((entry) => customizationModal.addedIngredientIds.includes(entry.ingredientId));
    const basePrice = toNumber(customizationModal.product.price);
    const extrasTotal = added.reduce((sum, entry) => sum + toNumber(entry.ingredient.extraPrice), 0);

    return {
      removed,
      added,
      basePrice,
      total: basePrice + extrasTotal
    };
  }, [customizationModal]);

  const changeAmount = useMemo(() => {
    if (paymentMethod !== "CASH" || !billPreview) return null;
    const received = toNumberOrUndefined(cashAmount);
    if (received === undefined) return null;
    return received - billPreview.total;
  }, [billPreview, cashAmount, paymentMethod]);

  if (viewport === "mobile") {
    return <Navigate replace to="/tables" />;
  }

  async function refreshTablesAndOrders(tableId: string | null) {
    const tablesData = await api.get<TableListResponse>("/tables");
    setTables(tablesData.tables);

    if (!tableId) {
      setOrders([]);
      return;
    }

    const ordersData = await api.get<Order[]>(`/orders/table/${tableId}`);
    setOrders(ordersData);
  }

  function selectTable(tableId: string) {
    setSelectedTableId(tableId);
    setEditingGroupKey(null);
    setProductSessionCounts({});
  }

  function deselectTable() {
    setSelectedTableId(null);
    setOrders([]);
    setEditingGroupKey(null);
    setProductSessionCounts({});
    setBillingOpen(false);
    setBillPreview(null);
  }

  function openCustomization(product: Product) {
    setCustomizationModal({
      product,
      removedIngredientIds: [],
      addedIngredientIds: []
    });
  }

  function flashProduct(productId: string) {
    setHighlightedProductId(productId);
    window.setTimeout(() => setHighlightedProductId((current) => (current === productId ? null : current)), 220);
  }

  async function addProductToSelectedTable(
    product: Product,
    modifications: Array<{ ingredientId: string; action: ModificationAction }> = []
  ) {
    if (!selectedTable) return;

    setAddingProductId(product.id);

    try {
      await api.post("/orders", {
        tableId: selectedTable.id,
        items: [
          {
            productId: product.id,
            quantity: 1,
            modifications
          }
        ]
      });

      await refreshTablesAndOrders(selectedTable.id);
      setProductSessionCounts((current) => ({
        ...current,
        [product.id]: (current[product.id] ?? 0) + 1
      }));
      flashProduct(product.id);
      showToast({
        type: "success",
        title: "TPV",
        message: `${product.name} anadido`
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "TPV",
        message: error instanceof Error ? error.message : "No se pudo anadir el producto"
      });
    } finally {
      setAddingProductId(null);
    }
  }

  async function handleProductPress(product: Product) {
    if (!selectedTable || !(product.available ?? true)) return;

    if ((product.productIngredients?.length ?? 0) > 0) {
      openCustomization(product);
      return;
    }

    await addProductToSelectedTable(product);
  }

  async function adjustGroupedConsumption(group: GroupedConsumption, delta: 1 | -1) {
    const targetRef = group.refs[group.refs.length - 1];
    if (!targetRef) return;

    setEditingGroupKey(group.key);

    try {
      if (delta > 0) {
        await api.patch(`/orders/${targetRef.orderId}/items/${targetRef.itemId}`, {
          quantity: targetRef.quantity + 1,
          notes: targetRef.notes,
          modifications: targetRef.modifications
        });
      } else if (targetRef.quantity > 1) {
        await api.patch(`/orders/${targetRef.orderId}/items/${targetRef.itemId}`, {
          quantity: targetRef.quantity - 1,
          notes: targetRef.notes,
          modifications: targetRef.modifications
        });
      } else {
        const confirmed = window.confirm(`Eliminar ${group.name} de la mesa?`);
        if (!confirmed) return;
        await api.delete(`/orders/${targetRef.orderId}/items/${targetRef.itemId}`);
      }

      await refreshTablesAndOrders(selectedTableId);
    } catch (error) {
      showToast({
        type: "error",
        title: "TPV",
        message: error instanceof Error ? error.message : "No se pudo actualizar la cantidad"
      });
    }
  }

  async function openBilling() {
    if (!selectedTable) return;

    try {
      const preview = await api.get<BillPreview>(`/bills/table/${selectedTable.id}/preview`);
      setBillPreview(preview);
      setPaymentMethod("CASH");
      setCashAmount("");
      setCardAmount("");
      setBillingOpen(true);
    } catch (error) {
      showToast({
        type: "error",
        title: "TPV",
        message: error instanceof Error ? error.message : "No se pudo abrir el cobro"
      });
    }
  }

  async function submitBill() {
    if (!selectedTable || !billPreview) return;

    setSubmittingBill(true);

    try {
      await api.post("/bills", {
        tableId: selectedTable.id,
        paymentMethod,
        cashAmount: paymentMethod === "CARD" ? undefined : toNumberOrUndefined(cashAmount),
        cardAmount:
          paymentMethod === "CARD"
            ? billPreview.total
            : paymentMethod === "CASH"
              ? undefined
              : toNumberOrUndefined(cardAmount)
      });

      const total = billPreview.total;
      const tableNumber = selectedTable.number;
      await refreshTablesAndOrders(null);
      setBillingOpen(false);
      setBillPreview(null);
      showToast({
        type: "success",
        title: "TPV",
        message: `Mesa ${tableNumber} cobrada · ${formatCurrency(total)}`
      });
      deselectTable();
    } catch (error) {
      showToast({
        type: "error",
        title: "TPV",
        message: error instanceof Error ? error.message : "No se pudo cobrar la mesa"
      });
    } finally {
      setSubmittingBill(false);
    }
  }

  function confirmCustomization() {
    if (!customizationModal || !customizationSummary) return;

    const modifications = [
      ...customizationSummary.removed.map((entry) => ({
        ingredientId: entry.ingredientId,
        action: "REMOVED" as const
      })),
      ...customizationSummary.added.map((entry) => ({
        ingredientId: entry.ingredientId,
        action: "ADDED" as const
      }))
    ];

    void addProductToSelectedTable(customizationModal.product, modifications);
    setCustomizationModal(null);
  }

  const showThreePanels = Boolean(selectedTable) && viewport === "wide";
  const showTwoPanels = Boolean(selectedTable) && viewport === "narrow";

  return (
    <section className="min-h-[calc(100vh-52px)]">
      {loadingTables || loadingProducts ? (
        <div className="flex min-h-[70vh] items-center justify-center">
          <Spinner className="h-6 w-6" label="Cargando TPV" />
        </div>
      ) : !selectedTable ? (
        <div className="mx-auto max-w-[1500px] px-2 pt-3">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((table) => (
              <button
                key={table.id}
                className={`min-h-[172px] rounded-3xl px-6 py-6 text-left transition-all duration-300 ${tableStateStyles[table.status]} hover:shadow-sm`}
                onClick={() => selectTable(table.id)}
                type="button"
              >
                <p className="mono text-6xl font-bold text-[var(--color-text)]">{table.number}</p>
                {table.status === "OCCUPIED" && table.summary ? (
                  <div className="mt-5 space-y-1.5">
                    <p className="text-base text-[var(--color-text-muted)]">{formatDurationFrom(table.summary.occupiedSince)}</p>
                    <p className="text-xl font-semibold text-[var(--color-text)]">{formatCurrency(table.summary.partialTotal)}</p>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-3 px-2 pt-3 transition-all duration-300 ${
            showThreePanels ? "xl:grid-cols-[96px_minmax(0,1.15fr)_minmax(360px,0.95fr)]" : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]"
          }`}
        >
          {showThreePanels ? (
            <aside className="h-[calc(100vh-72px)] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-white p-2">
              <div className="space-y-2">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    className={`w-full rounded-2xl px-2 py-3 text-left transition-all duration-300 ${compactTableStateStyles[table.status]} ${
                      selectedTable.id === table.id ? "border-2 border-[var(--color-primary)] shadow-sm opacity-100" : ""
                    }`}
                    onClick={() => selectTable(table.id)}
                    type="button"
                  >
                    <p className="mono text-lg font-bold text-[var(--color-text)]">{table.number}</p>
                    {table.status === "OCCUPIED" && table.summary ? (
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{formatCurrency(table.summary.partialTotal)}</p>
                    ) : null}
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          <section className="h-[calc(100vh-72px)] rounded-3xl border border-[var(--color-border)] bg-white p-4 transition-all duration-300">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      activeCategory?.id === category.id
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[#efede8] text-[var(--color-text-muted)]"
                    }`}
                    onClick={() => setActiveCategoryId(category.id)}
                    type="button"
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              {showTwoPanels ? (
                <button className="btn-secondary px-3 py-2 text-sm" onClick={deselectTable} type="button">
                  Mesas
                </button>
              ) : null}
            </div>

            <div className="grid max-h-[calc(100%-20px)] grid-cols-2 gap-3 overflow-y-auto pr-1">
              {activeCategory?.products.map((product) => {
                const available = product.available ?? true;
                const productCount = productSessionCounts[product.id] ?? 0;

                return (
                  <ProductCard
                    key={product.id}
                    available={available}
                    count={productCount}
                    highlight={highlightedProductId === product.id}
                    highlightClassName="bg-emerald-50 shadow-sm"
                    imageUrl={product.imageUrl}
                    loading={addingProductId === product.id}
                    name={product.name}
                    onPress={() => void handleProductPress(product)}
                    price={toNumber(product.price)}
                    variant="auto"
                  />
                );
                const hasImage = Boolean(product.imageUrl);

                return (
                  <article
                    key={product.id}
                    className={`overflow-hidden rounded-2xl border border-[#E5E2DC] bg-white transition-all duration-200 ${
                      highlightedProductId === product.id ? "bg-emerald-50 shadow-sm" : ""
                    } ${available ? "" : "opacity-40"} ${hasImage ? "min-h-[136px]" : "min-h-[88px]"}`}
                  >
                    {hasImage ? (
                      <div className="relative h-24 w-full overflow-hidden bg-[#f5f2ee]">
                        <img alt={product.name} className="h-full w-full object-cover" src={buildAssetUrl(product.imageUrl!)} />
                        <button
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white disabled:bg-[#d6cfc5]"
                          disabled={!available || addingProductId === product.id}
                          onClick={() => void handleProductPress(product)}
                          type="button"
                        >
                          {addingProductId === product.id ? <Spinner className="h-4 w-4" label="Anadiendo" /> : productCount > 0 ? productCount : "+"}
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-medium text-[var(--color-text)]">{product.name}</h2>
                        <p className="mt-2 text-sm font-bold text-[var(--color-primary)]">{formatCurrency(toNumber(product.price))}</p>
                        {!available ? <p className="mt-1 text-xs font-medium text-red-600">Agotado</p> : null}
                      </div>

                      {!hasImage ? (
                        <button
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white disabled:bg-[#d6cfc5]"
                          disabled={!available || addingProductId === product.id}
                          onClick={() => void handleProductPress(product)}
                          type="button"
                        >
                          {addingProductId === product.id ? <Spinner className="h-4 w-4" label="Anadiendo" /> : productCount > 0 ? productCount : "+"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="flex h-[calc(100vh-72px)] min-h-0 flex-col rounded-3xl border border-[var(--color-border)] bg-white p-4 transition-all duration-300">
            <div className="border-b border-[var(--color-border)] pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold text-[var(--color-text)]">Mesa {selectedTable.number}</h2>
                    {selectedTable.status === "OCCUPIED" ? (
                      <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">
                        Ocupada
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {selectedTable.status === "OCCUPIED"
                      ? `${formatDurationFrom(selectedTable.summary?.occupiedSince)} · ${selectedTable.summary?.openedBy?.name ?? "-"}`
                      : "Sin pedidos aun"}
                  </p>
                </div>
                <button className="btn-ghost h-10 w-10 rounded-full text-xl" onClick={deselectTable} type="button">
                  x
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              {loadingOrders ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-5 w-5" label="Actualizando mesa" />
                </div>
              ) : groupedConsumptions.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
                  Sin pedidos aun
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedConsumptions.map((group) => (
                    <button
                      key={group.key}
                      className="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition-colors duration-200 hover:bg-[#faf8f5]"
                      onClick={() => setEditingGroupKey(group.key)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--color-text)]">
                            {group.quantity}x {group.name}
                          </p>
                          {group.modifications.map((modification) => (
                            <p key={`${group.key}-${modification}`} className="mt-1 text-xs text-orange-600">
                              {modification}
                            </p>
                          ))}
                          {group.notes.map((note) => (
                            <p key={`${group.key}-${note}`} className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {note}
                            </p>
                          ))}
                        </div>
                        <span className="whitespace-nowrap text-sm font-medium text-[var(--color-text)]">
                          {formatCurrency(group.total)}
                        </span>
                      </div>

                      {editingGroupKey === group.key ? (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-lg text-[var(--color-text)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              void adjustGroupedConsumption(group, -1);
                            }}
                            type="button"
                          >
                            -
                          </button>
                          <span className="mono min-w-8 text-center text-sm text-[var(--color-text)]">{group.quantity}</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg text-white"
                            onClick={(event) => {
                              event.stopPropagation();
                              void adjustGroupedConsumption(group, 1);
                            }}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--color-border)] pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                  <span>IVA (10%)</span>
                  <span>{formatCurrency(totals.tax)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    Total
                  </span>
                  <span className="mono text-2xl font-bold text-[var(--color-text)]">{formatCurrency(totals.total)}</span>
                </div>
              </div>

              <button
                className="mt-4 w-full rounded-2xl bg-[#E85D2A] px-5 py-4 text-base font-semibold text-white transition-colors duration-200 hover:bg-[#cf4f20] disabled:bg-[#f2b8a1]"
                disabled={totals.total <= 0}
                onClick={() => void openBilling()}
                type="button"
              >
                Cobrar
              </button>
            </div>
          </section>
        </div>
      )}

      {billingOpen && billPreview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Total</p>
              <p className="mono mt-2 text-4xl font-bold text-[var(--color-text)]">{formatCurrency(billPreview.total)}</p>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {paymentMethods.map((method) => (
                <button
                  key={method.key}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
                    paymentMethod === method.key ? "border-[var(--color-primary)] bg-orange-50" : "border-[var(--color-border)] bg-white"
                  }`}
                  onClick={() => setPaymentMethod(method.key)}
                  type="button"
                >
                  <span className={`font-semibold ${paymentMethod === method.key ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
                    {method.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              {paymentMethod !== "CARD" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">Recibido</span>
                  <input
                    className="field-input"
                    inputMode="decimal"
                    onChange={(event) => setCashAmount(event.target.value.replace(",", "."))}
                    value={cashAmount}
                  />
                </label>
              ) : null}

              {paymentMethod === "MIXED" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">Tarjeta</span>
                  <input
                    className="field-input"
                    inputMode="decimal"
                    onChange={(event) => setCardAmount(event.target.value.replace(",", "."))}
                    value={cardAmount}
                  />
                </label>
              ) : null}

              {paymentMethod === "CASH" && changeAmount !== null ? (
                <div className="rounded-2xl bg-[var(--color-surface-muted)] px-4 py-3">
                  <p className="text-sm text-[var(--color-text-muted)]">Cambio</p>
                  <p className={`mono mt-1 text-2xl font-bold ${changeAmount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {formatCurrency(changeAmount)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex gap-3">
              <button className="flex-1 text-sm text-[var(--color-text-muted)]" onClick={() => setBillingOpen(false)} type="button">
                Cancelar
              </button>
              <button
                className="flex-1 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition-colors duration-200 hover:bg-emerald-700 disabled:bg-emerald-300"
                disabled={submittingBill}
                onClick={() => void submitBill()}
                type="button"
              >
                {submittingBill ? <Spinner className="h-5 w-5" label="Cobrando" /> : "Confirmar cobro"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customizationModal && customizationSummary ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
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
                        <label
                          key={entry.ingredientId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              checked={!disabled}
                              onChange={() =>
                                setCustomizationModal((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    removedIngredientIds: disabled
                                      ? current.removedIngredientIds.filter((value) => value !== entry.ingredientId)
                                      : [...current.removedIngredientIds, entry.ingredientId]
                                  };
                                })
                              }
                              type="checkbox"
                            />
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
                        <label
                          key={entry.ingredientId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              checked={checked}
                              onChange={() =>
                                setCustomizationModal((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    addedIngredientIds: checked
                                      ? current.addedIngredientIds.filter((value) => value !== entry.ingredientId)
                                      : [...current.addedIngredientIds, entry.ingredientId]
                                  };
                                })
                              }
                              type="checkbox"
                            />
                            <span className="text-sm text-[var(--color-text)]">{entry.ingredient.name}</span>
                          </div>
                          <span className="text-sm font-medium text-emerald-700">
                            + {formatCurrency(toNumber(entry.ingredient.extraPrice))}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-sm text-[var(--color-text)]">
                {customizationModal.product.name}: {formatCurrency(customizationSummary.basePrice)}
                {customizationSummary.added
                  .map((entry) => ` + ${entry.ingredient.name} ${formatCurrency(toNumber(entry.ingredient.extraPrice))}`)
                  .join("")}
                {" = "}
                <span className="font-semibold">{formatCurrency(customizationSummary.total)}</span>
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button className="btn-secondary px-4 py-2.5 text-sm" onClick={() => setCustomizationModal(null)} type="button">
                Cancelar
              </button>
              <button className="btn-primary px-4 py-2.5 text-sm font-semibold" onClick={confirmCustomization} type="button">
                Anadir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function useViewportMode() {
  const [mode, setMode] = useState<"mobile" | "narrow" | "wide">(() => getViewportMode(window.innerWidth));

  useEffect(() => {
    function onResize() {
      setMode(getViewportMode(window.innerWidth));
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return mode;
}

function getViewportMode(width: number) {
  if (width < 1024) return "mobile";
  if (width < 1280) return "narrow";
  return "wide";
}

function formatDurationFrom(value: string | null | undefined) {
  if (!value) return "-";
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes} min`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function toNumberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildAssetUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
  const origin = apiBaseUrl.endsWith("/api") ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
  return `${origin}${path}`;
}
