type AlignMode = "left" | "center" | "right";

type KitchenOrder = {
  id?: string;
  createdAt?: string | Date;
  table?: {
    number: number;
  };
  waiter?: {
    name: string;
  } | null;
  items: Array<{
    quantity: number;
    product: {
      name: string;
    };
    notes?: string | null;
  }>;
};

type ReceiptBill = {
  id?: string;
  paidAt?: string | Date;
  table?: {
    number: number;
  };
  waiter?: {
    name: string;
  } | null;
  items?: Array<{
    quantity: number;
    name: string;
    total: number;
  }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  paymentMethod?: string;
  cashAmount?: number | null;
  changeAmount?: number | null;
};

type RestaurantInfo = {
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
  const rightLength = right.length;
  const gap = Math.max(1, width - safeLeft.length - rightLength);
  return `${safeLeft}${" ".repeat(gap)}${right}`;
}

function divider(width = 32) {
  return "=".repeat(width);
}

function dashed(width = 32) {
  return "-".repeat(width);
}

function formatTime(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();

  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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

function formatEuro(value: number | null | undefined) {
  const amount = value ?? 0;
  return `${amount.toFixed(2).replace(".", ",")}€`;
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

export class ESCPOSBuilder {
  private chunks: Buffer[] = [];

  public initialize() {
    this.chunks.push(Buffer.from([ESC, 0x40]));
    return this.codePageCP858();
  }

  public codePageCP858() {
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

export function generateKitchenTicket(order: KitchenOrder): Buffer {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const builder = new ESCPOSBuilder().initialize();

  builder.align("center").bold(true).line(divider()).line("*** NUEVO PEDIDO ***").line(divider());
  builder.bold(false);
  builder.align("left");
  builder.line(padLine(`Mesa: ${order.table?.number ?? "-"}`, `Hora: ${formatTime(order.createdAt)}`));
  builder.line(`Camarero: ${order.waiter?.name ?? "-"}`);
  builder.line(dashed());

  for (const item of order.items) {
    for (const line of wrapText(`x${item.quantity}  ${item.product.name}`)) {
      builder.line(line);
    }

    if (item.notes?.trim()) {
      for (const noteLine of wrapText(`>> ${item.notes.trim()}`, 30)) {
        builder.line(`  ${noteLine}`);
      }
    }
  }

  builder.line(dashed());
  builder.bold(true).line(`TOTAL ITEMS: ${totalItems}`).bold(false);
  builder.align("center");
  builder.doubleSize(true).line(`MESA ${order.table?.number ?? "-"}`).doubleSize(false);
  builder.line(divider()).newLine(1).cut();

  return builder.build();
}

export function generateReceiptTicket(
  bill: ReceiptBill,
  restaurant: RestaurantInfo
): Buffer {
  const builder = new ESCPOSBuilder().initialize();

  builder.align("center").bold(true).line(restaurant.name.toUpperCase()).bold(false);
  builder.line(restaurant.address);
  builder.line(`Tel: ${restaurant.phone}`);
  builder.line(divider());
  builder.align("left");
  builder.line(`Ticket: #${bill.id ?? "-"}`);
  builder.line(`Fecha: ${formatDateTime(bill.paidAt)}`);
  builder.line(`Mesa: ${bill.table?.number ?? "-"}`);
  builder.line(`Atendido por: ${bill.waiter?.name ?? "-"}`);
  builder.line(dashed());

  for (const item of bill.items ?? []) {
    const left = `${item.quantity}x ${item.name}`;
    const right = formatEuro(item.total);
    const wrapped = wrapText(left, 20);

    wrapped.forEach((line, index) => {
      builder.line(index === 0 ? padLine(line, right) : line);
    });
  }

  builder.line(dashed());
  builder.line(padLine("Subtotal:", formatEuro(bill.subtotal)));
  builder.line(padLine("IVA (10%):", formatEuro(bill.tax)));
  builder.bold(true).line(padLine("TOTAL:", formatEuro(bill.total))).bold(false);
  builder.line(dashed());
  builder.line(`Pago: ${bill.paymentMethod ?? "-"}`);

  if (bill.cashAmount !== null && bill.cashAmount !== undefined) {
    builder.line(padLine("Entregado:", formatEuro(bill.cashAmount)));
  }

  if (bill.changeAmount !== null && bill.changeAmount !== undefined) {
    builder.line(padLine("Cambio:", formatEuro(bill.changeAmount)));
  }

  builder.align("center").line(divider());
  builder.line(restaurant.ticketMessage?.trim() || "Gracias por su visita");
  builder.line(divider()).newLine(1).cut();

  return builder.build();
}

export function generateTestTicket(label: string): Buffer {
  return new ESCPOSBuilder()
    .initialize()
    .align("center")
    .bold(true)
    .line("TEST DE IMPRESION")
    .bold(false)
    .line(divider())
    .doubleSize(true)
    .line(label.toUpperCase())
    .doubleSize(false)
    .line(`Fecha: ${formatDateTime()}`)
    .newLine(1)
    .align("left")
    .line("TPV Print Relay operativo")
    .newLine(1)
    .cut()
    .build();
}
