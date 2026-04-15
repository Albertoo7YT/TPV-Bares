import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import type { StoredUser } from "../services/tokenStorage";

type TabItem = {
  to: string;
  label: string;
  roles: StoredUser["role"][];
};

const tabs: TabItem[] = [
  { to: "/tables", label: "Mesas", roles: ["WAITER", "ADMIN"] },
  { to: "/tpv", label: "TPV", roles: ["WAITER", "ADMIN"] },
  { to: "/bills", label: "Cuentas", roles: ["ADMIN"] },
  { to: "/admin", label: "Admin", roles: ["ADMIN"] }
];

const clientLogoUrl =
  "https://storage.googleapis.com/gcs-guo-webcms-pro/cms/published_images/525395_1753274987/logo.jpeg";

export default function AppLayout() {
  const { user } = useAuth();
  const { isConnected, isReconnecting } = useSocket();
  const location = useLocation();

  if (!user) {
    return null;
  }

  const isTpvRoute = location.pathname === "/tpv";
  const visibleTabs = tabs.filter((tab) => tab.roles.includes(user.role));
  const mobileTabs = visibleTabs.filter((tab) => tab.to !== "/tpv");

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {isReconnecting && !isConnected ? (
        <div
          aria-live="polite"
          className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-700 backdrop-blur"
        >
          Reconectando...
        </div>
      ) : null}

      {isTpvRoute ? (
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-10 max-w-[1600px] items-center justify-between gap-4 px-4">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Deja Vu</p>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 md:flex">
                {visibleTabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                        isActive ? "bg-orange-50 text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {user.name} · {formatRoleLabel(user.role)}
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
            <div className="flex w-full justify-start md:w-auto">
              <img
                alt="Logo del cliente"
                className="h-12 w-auto object-contain md:h-14"
                src={clientLogoUrl}
              />
            </div>

            <div className="hidden items-center gap-2 md:flex">
              {visibleTabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive ? "bg-orange-50 text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </div>
        </header>
      )}

      <main className={`mx-auto ${isTpvRoute ? "max-w-[1600px] px-3 pb-6 pt-3" : "max-w-6xl px-4 pb-28 pt-2"}`}>
        <div className="page-enter" key={location.pathname}>
          <Outlet />
        </div>
      </main>

      {!isTpvRoute ? (
        <nav className="fixed inset-x-0 bottom-0 border-t border-[var(--color-border)] bg-white/98 px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur md:hidden">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))` }}
          >
            {mobileTabs.map((tab) => (
              <NavLink
                key={tab.to}
                aria-label={`Ir a ${tab.label}`}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center text-[11px] font-medium transition-all duration-200 ${
                    isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                  }`
                }
                to={tab.to}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute inset-x-4 top-0 h-0.5 rounded-full ${
                        isActive ? "bg-[var(--color-primary)]" : "bg-transparent"
                      }`}
                    />
                    {getTabIcon(tab.label)}
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function formatRoleLabel(role: StoredUser["role"]) {
  if (role === "ADMIN") return "Admin";
  if (role === "WAITER") return "Camarero/a";
  return "Cocina";
}

function getTabIcon(label: string) {
  if (label === "Mesas") return <GridIcon />;
  if (label === "TPV") return <TerminalIcon />;
  if (label === "Cuentas") return <BillIcon />;
  return <SettingsIcon />;
}

function iconProps() {
  return {
    "aria-hidden": true,
    className: "h-5 w-5"
  };
}

function GridIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BillIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M7 4h10v16l-2-1.5-3 1.5-3-1.5L7 20zM9 9h6m-6 4h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg {...iconProps()} fill="none" viewBox="0 0 24 24">
      <path d="M4 6h16v12H4zM8 10l2 2-2 2m5 0h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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
