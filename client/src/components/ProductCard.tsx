import Spinner from "./Spinner";
import { buildAssetUrl } from "../services/assets";

type ProductCardVariant = "auto" | "withPhoto" | "compact";

type ProductCardProps = {
  name: string;
  price: number;
  imageUrl?: string | null;
  available?: boolean;
  count?: number;
  loading?: boolean;
  highlight?: boolean;
  highlightClassName?: string;
  variant?: ProductCardVariant;
  onPress: () => void;
};

export default function ProductCard({
  name,
  price,
  imageUrl,
  available = true,
  count = 0,
  loading = false,
  highlight = false,
  highlightClassName = "bg-orange-50 shadow-sm",
  variant = "auto",
  onPress
}: ProductCardProps) {
  const resolvedVariant = variant === "auto" ? (imageUrl ? "withPhoto" : "compact") : variant;
  const disabled = !available || loading;
  const buttonLabel = loading ? <Spinner className="h-4 w-4" label="Anadiendo" /> : count > 0 ? count : "+";

  if (resolvedVariant === "withPhoto") {
    return (
      <article
        className={`overflow-hidden rounded-xl border border-[#E5E2DC] bg-white transition-all duration-200 ${
          highlight ? highlightClassName : ""
        } ${available ? "" : "opacity-40"}`}
      >
        <div className="relative aspect-square overflow-hidden bg-[var(--color-surface-muted)]">
          {imageUrl ? (
            <img alt={name} className="h-full w-full object-cover" src={buildAssetUrl(imageUrl)} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Foto
            </div>
          )}
          <button
            aria-label={`Anadir ${name}`}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:bg-[#d6cfc5]"
            disabled={disabled}
            onClick={onPress}
            type="button"
          >
            {buttonLabel}
          </button>
        </div>
        <div className="space-y-1.5 p-3">
          <h2 className="truncate text-sm font-medium text-[var(--color-text)]">{name}</h2>
          <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(price)}</p>
          {!available ? <p className="text-xs font-medium text-red-600">Agotado</p> : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`rounded-xl border border-[#E5E2DC] bg-white transition-all duration-200 ${
        highlight ? highlightClassName : ""
      } ${available ? "" : "opacity-40"}`}
    >
      <div className="flex min-h-[70px] items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1 pr-1">
          <h2
            className="text-sm font-medium leading-5 text-[var(--color-text)]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}
          >
            {name}
          </h2>
          <p className="mt-1.5 text-sm font-bold text-[var(--color-primary)]">{formatCurrency(price)}</p>
          {!available ? <p className="mt-1 text-xs font-medium text-red-600">Agotado</p> : null}
        </div>
        <button
          aria-label={`Anadir ${name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white transition-all duration-200 disabled:bg-[#d6cfc5]"
          disabled={disabled}
          onClick={onPress}
          type="button"
        >
          {buttonLabel}
        </button>
      </div>
    </article>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}
