import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type AdminNavItem = {
  to: string;
  label: string;
  section: string;
  icon: React.ReactNode;
};

const navItems: AdminNavItem[] = [
  {
    to: "/admin",
    label: "Dashboard",
    section: "Operaciones",
    icon: <BarsIcon />
  },
  {
    to: "/admin/tables",
    label: "Mesas",
    section: "Operaciones",
    icon: <GridIcon />
  },
  {
    to: "/admin/categories",
    label: "Categorias",
    section: "Carta",
    icon: <FolderIcon />
  },
  {
    to: "/admin/products",
    label: "Productos",
    section: "Carta",
    icon: <BurgerIcon />
  },
  {
    to: "/admin/ingredients",
    label: "Ingredientes",
    section: "Carta",
    icon: <LayersIcon />
  },
  {
    to: "/admin/cash-register",
    label: "Caja del dia",
    section: "Finanzas",
    icon: <CashIcon />
  },
  {
    to: "/admin/bills",
    label: "Historial de cuentas",
    section: "Finanzas",
    icon: <ReceiptIcon />
  },
  {
    to: "/admin/reports",
    label: "Informes de ventas",
    section: "Finanzas",
    icon: <TrendIcon />
  },
  {
    to: "/admin/users",
    label: "Usuarios y PINs",
    section: "Configuracion",
    icon: <UsersIcon />
  },
  {
    to: "/admin/devices",
    label: "Dispositivos",
    section: "Configuracion",
    icon: <PhoneIcon />
  },
  {
    to: "/admin/printers",
    label: "Impresoras",
    section: "Configuracion",
    icon: <PrinterIcon />
  },
  {
    to: "/admin/settings",
    label: "Datos del restaurante",
    section: "Configuracion",
    icon: <SettingsIcon />
  }
];

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/tables": "Gestion de mesas",
  "/admin/categories": "Categorias",
  "/admin/products": "Productos",
  "/admin/ingredients": "Ingredientes",
  "/admin/cash-register": "Caja del dia",
  "/admin/bills": "Historial de cuentas",
  "/admin/reports": "Informes de ventas",
  "/admin/users": "Usuarios y PINs",
  "/admin/devices": "Dispositivos",
  "/admin/printers": "Impresoras",
  "/admin/settings": "Datos del restaurante"
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, AdminNavItem[]>();

    for (const item of navItems) {
      const currentItems = groups.get(item.section) ?? [];
      currentItems.push(item);
      groups.set(item.section, currentItems);
    }

    return Array.from(groups.entries());
  }, []);

  const title = pageTitles[location.pathname] ?? "Panel Admin";

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] border-r border-[var(--color-border)] bg-white transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--color-border)] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Deja Vu
            </p>
            <h1 className="mt-2 text-xl font-bold text-[var(--color-text)]">Panel Admin</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {user?.name ?? "Admin"}
            </p>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-6">
              {groupedItems.map(([section, items]) => (
                <div key={section}>
                  <p className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    {section}
                  </p>
                  <div className="mt-2 space-y-1">
                    {items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setIsOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-3 text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "border-l-[var(--color-primary)] bg-orange-50 text-[var(--color-primary)]"
                              : "border-l-transparent text-[#5f5b57] hover:bg-[var(--color-surface-muted)]"
                          }`
                        }
                        end={item.to === "/admin"}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="border-t border-[var(--color-border)] px-3 py-4">
            <button
              className="btn-secondary mb-2 w-full px-4 py-2.5 text-sm font-medium"
              onClick={() => {
                setIsOpen(false);
                navigate("/tables");
              }}
              type="button"
            >
              Ir a sala
            </button>
            <button
              className="btn-ghost w-full px-4 py-2.5 text-sm font-medium"
              onClick={logout}
              type="button"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-4 md:px-6">
            <button
              aria-label="Abrir menu admin"
              className="btn-ghost flex h-11 w-11 items-center justify-center lg:hidden"
              onClick={() => setIsOpen(true)}
              type="button"
            >
              <MenuIcon />
            </button>

            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Admin / {title}
              </p>
              <h2 className="truncate text-2xl font-bold text-[var(--color-text)]">{title}</h2>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function iconProps() {
  return {
    "aria-hidden": true,
    className: "h-5 w-5"
  };
}

function MenuIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M6 19V10m6 9V5m6 14v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l1.5 2H18.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function BurgerIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M5 10a7 7 0 0 1 14 0M4 12h16M6 15h12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="m12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16v10H4zM8 12h8M7 9h.01M17 15h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M7 4h10v16l-2-1.5-3 1.5-3-1.5L7 20zM9 9h6m-6 4h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="m4 16 5-5 4 4 7-7M15 8h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 15h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M7 8V5h10v3M6 17h12v2H6zm-1-8h14a2 2 0 0 1 2 2v4h-4v-2H7v2H3v-4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Zm7 3.5-.97-.56.07-1.13-1.72-2.98-1.03.32-.83-.76-3.44-1.14-.55.94h-1.1l-.55-.94-3.44 1.14-.83.76-1.03-.32L4.9 10.3l.07 1.13L4 12l.97.56-.07 1.13 1.72 2.98 1.03-.32.83.76 3.44 1.14.55-.94h1.1l.55.94 3.44-1.14.83-.76 1.03.32 1.72-2.98-.07-1.13z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
