import { useAuth } from "../context/AuthContext";

export default function KitchenUnavailablePage() {
  const { logout } = useAuth();

  return (
    <section className="surface-card mx-auto max-w-2xl p-8 text-center">
      <h1 className="text-3xl font-bold text-[var(--color-text)]">Vista de cocina desactivada</h1>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        La vista de cocina no esta activada. Contacta con el administrador.
      </p>
      <button
        className="mx-auto mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors duration-200 hover:text-[var(--color-primary)]"
        onClick={logout}
        type="button"
      >
        <LogoutIcon />
        Cerrar sesión
      </button>
    </section>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M10 7V5a2 2 0 0 1 2-2h6v18h-6a2 2 0 0 1-2-2v-2M15 12H4m0 0 3-3m-3 3 3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
