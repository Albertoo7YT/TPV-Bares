import { Link } from "react-router-dom";

const sections = [
  {
    to: "/admin/categories",
    label: "Categorias",
    description: "Ordena, activa y organiza las secciones de la carta.",
    accent: "bg-orange-50 text-orange-700 border-orange-200"
  },
  {
    to: "/admin/products",
    label: "Gestion de carta",
    description: "Categorias, productos y disponibilidad en tiempo real.",
    accent: "bg-orange-50 text-orange-700 border-orange-200"
  },
  {
    to: "/admin/tables",
    label: "Gestion de mesas",
    description: "Configuracion de sala, terraza y estados operativos.",
    accent: "bg-blue-50 text-blue-700 border-blue-200"
  },
  {
    to: "/admin/users",
    label: "Usuarios",
    description: "PINs, roles y activacion del personal del restaurante.",
    accent: "bg-emerald-50 text-emerald-700 border-emerald-200"
  },
  {
    to: "/admin/reports",
    label: "Informes de ventas",
    description: "Analitica avanzada por periodo, categorias, productos y equipo.",
    accent: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    to: "/admin/cash-register",
    label: "Caja",
    description: "Apertura, cierre, historico y resumen del turno.",
    accent: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    to: "/admin/settings",
    label: "Configuracion",
    description: "Datos del restaurante, fiscalidad, operativa y mantenimiento.",
    accent: "bg-red-50 text-red-700 border-red-200"
  },
  {
    to: "/bills",
    label: "Historial de cuentas",
    description: "Consulta las cuentas cobradas y el detalle del dia.",
    accent: "bg-stone-100 text-stone-700 border-stone-200"
  }
];

export default function AdminPage() {
  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Panel de administracion</h1>
        <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
          Gestiona la operativa del restaurante desde un panel claro y rapido:
          carta, mesas, usuarios, caja e historial de cuentas.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link
            className="surface-card group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            key={section.to}
            to={section.to}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${section.accent}`}
                >
                  Admin
                </span>
                <h2 className="mt-4 text-xl font-semibold text-[var(--color-text)]">
                  {section.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  {section.description}
                </p>
              </div>
              <span className="text-xl text-[var(--color-text-muted)] transition-colors duration-200 group-hover:text-[var(--color-primary)]">
                ›
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
