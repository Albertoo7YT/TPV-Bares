export default function BillsPage() {
  return (
    <section className="space-y-6 page-enter">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Historial de cuentas</h1>
        <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
          Vista preparada para consultar y filtrar las cuentas cobradas del dia.
          Queda alineada con el nuevo sistema visual del panel admin.
        </p>
      </header>

      <div className="surface-card p-6">
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-8 text-center">
          <p className="text-base font-semibold text-[var(--color-text)]">
            Historial listo para conectarse con <code>/api/bills</code>
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            La base visual ya esta adaptada. Cuando quieras, el siguiente paso es
            pintar la lista real de cuentas y sus filtros.
          </p>
        </div>
      </div>
    </section>
  );
}
