type AlignMode = "left" | "center" | "right";

type KitchenOrderPayload = {
  id: string;
  createdAt: string | Date;
  notes?: string | null;
  table: {
    number: number;
  };
  waiter?: {
    name: string;
  } | null;
  items: Array<{
    quantity: number;
    notes?: string | null;
    product: {
      name: string;
    };
    modifications?: Array<{
      action: "REMOVED" | "ADDED";
      ingredient: {
        name: string;
      };
    }>;
  }>;
};

type ReceiptBillPayload = {
  id: string;
  paidAt: string | Date;
  paymentMethod: string;
  total: { toNumber(): number } | number;
  subtotal: { toNumber(): number } | number;
  tax: { toNumber(): number } | number;
  cashAmount?: { toNumber(): number } | number | null;
  cardAmount?: { toNumber(): number } | number | null;
  table: {
    number: number;
  };
  waiter?: {
    name: string;
  } | null;
  orders: Array<{
    items: Array<{
      quantity: number;
      unitPrice: { toNumber(): number } | number;
      product: {
        name: string;
      };
    }>;
  }>;
};

type RestaurantTicketPayload = {
  name: string;
  address: string;
  phone: string;
  ticketMessage?: string | null;
};

const ESC = 0x1b;
const GS = 0x1d;

const CP858_MAP = new Map<string, number>([
  ["€", 0xd5],
  ["á", 0xa0],
  ["é", 0x82],
  ["í", 0xa1],
  ["ó", 0xa2],
  ["ú", 0xa3],
  ["Á", 0xb5],
  ["É", 0x90],
  ["Í", 0xd6],
  ["Ó", 0xe0],
  ["Ú", 0xe9],
  ["ñ", 0xa4],
  ["Ñ", 0xa5],
  ["ü", 0x81],
  ["Ü", 0x9a],
  ["¡", 0xad],
  ["¿", 0xa8]
]);

function encodeCP858(text: string): Buffer {
  const bytes: number[] = [];

  for (const char of text) {
    if (CP858_MAP.has(char)) {
      bytes.push(CP858_MAP.get(char)!);
      continue;
    }

    const code = char.charCodeAt(0);
    bytes.push(code <= 0x7f ? code : 0x3f);
  }

  return Buffer.from(bytes);
}

function padLine(left: string, right: string, width = 32) {
  const safeLeft = left.slice(0, width);
  const gap = Math.max(1, width - safeLeft.length - right.length);
  return `${safeLeft}${" ".repeat(gap)}${right}`;
}

function wrapText(text: string, width = 32) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word.length > width ? word.slice(0, width) : word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function formatDateTime(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatTime(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();

  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatMoney(value: number | null | undefined) {
  const amount = value ?? 0;
  return `${amount.toFixed(2).replace(".", ",")}€`;
}

function decimalToNumber(value: { toNumber(): number } | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }

  return Number(value.toNumber().toFixed(2));
}

export class ESCPOSBuilder {
  private chunks: Buffer[] = [];

  public initialize() {
    this.chunks.push(Buffer.from([ESC, 0x40]));
    this.chunks.push(Buffer.from([ESC, 0x74, 0x13]));
    return this;
  }

  public align(mode: AlignMode) {
    const value = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    this.chunks.push(Buffer.from([ESC, 0x61, value]));
    return this;
  }

  public bold(enabled: boolean) {
    this.chunks.push(Buffer.from([ESC, 0x45, enabled ? 1 : 0]));
    return this;
  }

  public doubleSize(enabled: boolean) {
    this.chunks.push(Buffer.from([GS, 0x21, enabled ? 0x11 : 0x00]));
    return this;
  }

  public text(value: string) {
    this.chunks.push(encodeCP858(value));
    return this;
  }

  public line(value = "") {
    this.text(value);
    return this.newLine();
  }

  public newLine(lines = 1) {
    this.chunks.push(Buffer.from([ESC, 0x64, lines]));
    return this;
  }

  public cut() {
    this.chunks.push(Buffer.from([GS, 0x56, 0x42, 0x03]));
    return this;
  }

  public build() {
    return Buffer.concat(this.chunks);
  }
}

export function generateKitchenTicket(order: KitchenOrderPayload): Buffer {
  const builder = new ESCPOSBuilder().initialize();
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

  builder.align("center").bold(true).line("===========================").line("*** NUEVO PEDIDO ***").line("===========================");
  builder.bold(false).align("left");
  builder.line(padLine(`Mesa: ${order.table.number}`, `Hora: ${formatTime(order.createdAt)}`));
  builder.line(`Camarero: ${order.waiter?.name ?? "-"}`);
  builder.line("---------------------------");

  for (const item of order.items) {
    for (const line of wrapText(`x${item.quantity}  ${item.product.name}`)) {
      builder.line(line);
    }

    for (const modification of item.modifications ?? []) {
      const prefix = modification.action === "REMOVED" ? "** SIN " : "++ ";

      for (const line of wrapText(`${prefix}${modification.ingredient.name}`, 29)) {
        builder.line(`  ${line}`);
      }
    }

    if (item.notes?.trim()) {
      for (const note of wrapText(`>> ${item.notes.trim()}`, 29)) {
        builder.line(`  ${note}`);
      }
    }
  }

  builder.line("---------------------------");
  builder.bold(true).line(`TOTAL ITEMS: ${totalItems}`).bold(false);
  builder.align("center").line("===========================");
  builder.doubleSize(true).line(`MESA ${order.table.number}`).doubleSize(false);
  builder.newLine(1).cut();

  return builder.build();
}

export function generateReceiptTicket(
  bill: ReceiptBillPayload,
  restaurant: RestaurantTicketPayload
): Buffer {
  const builder = new ESCPOSBuilder().initialize();
  const itemRows = bill.orders.flatMap((order) =>
    order.items.map((item) => {
      const unitPrice = decimalToNumber(item.unitPrice) ?? 0;
      return {
        quantity: item.quantity,
        name: item.product.name,
        total: Number((item.quantity * unitPrice).toFixed(2))
      };
    })
  );

  const cashAmount = decimalToNumber(bill.cashAmount);
  const total = decimalToNumber(bill.total) ?? 0;
  const changeAmount =
    bill.paymentMethod === "CASH" && cashAmount !== null ? Number((cashAmount - total).toFixed(2)) : null;

  builder.align("center").bold(true).line(restaurant.name.toUpperCase()).bold(false);
  builder.line(restaurant.address);
  builder.line(`Tel: ${restaurant.phone}`);
  builder.line("===========================");
  builder.align("left");
  builder.line(`Ticket: #${bill.id}`);
  builder.line(`Fecha: ${formatDateTime(bill.paidAt)}`);
  builder.line(`Mesa: ${bill.table.number}`);
  builder.line(`Atendido por: ${bill.waiter?.name ?? "-"}`);
  builder.line("---------------------------");

  for (const item of itemRows) {
    const wrapped = wrapText(`${item.quantity}x ${item.name}`, 20);

    wrapped.forEach((line, index) => {
      builder.line(index === 0 ? padLine(line, formatMoney(item.total)) : line);
    });
  }

  builder.line("---------------------------");
  builder.line(padLine("Subtotal:", formatMoney(decimalToNumber(bill.subtotal))));
  builder.line(padLine("IVA (10%):", formatMoney(decimalToNumber(bill.tax))));
  builder.bold(true).line(padLine("TOTAL:", formatMoney(total))).bold(false);
  builder.line("---------------------------");
  builder.line(`Pago: ${bill.paymentMethod}`);

  if (cashAmount !== null) {
    builder.line(padLine("Entregado:", formatMoney(cashAmount)));
  }

  if (changeAmount !== null) {
    builder.line(padLine("Cambio:", formatMoney(changeAmount)));
  }

  builder.align("center").line("===========================");
  builder.line(restaurant.ticketMessage?.trim() || "Gracias por su visita");
  builder.line("===========================");
  builder.cut();

  return builder.build();
}

export function generateTestTicket(printer: "kitchen" | "receipt", restaurant: RestaurantTicketPayload): Buffer {
  return new ESCPOSBuilder()
    .initialize()
    .align("center")
    .bold(true)
    .line("TEST DE IMPRESION")
    .bold(false)
    .line("===========================")
    .doubleSize(true)
    .line(printer === "kitchen" ? "COCINA" : "CAJA")
    .doubleSize(false)
    .line(restaurant.name.toUpperCase())
    .line(formatDateTime())
    .newLine(1)
    .align("left")
    .line("Si ves este ticket, el relay responde correctamente.")
    .newLine(1)
    .cut()
    .build();
}
