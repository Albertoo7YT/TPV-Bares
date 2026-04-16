import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Spinner from "../../components/Spinner";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";

type UserRole = "ADMIN" | "WAITER" | "KITCHEN";

type UserItem = {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
};

type UserFormState = {
  id?: string;
  name: string;
  pinDigits: [string, string, string, string];
  role: UserRole;
  active: boolean;
};

const roleSections: Array<{
  role: UserRole;
  title: string;
  description: string;
  accent: string;
  icon: ReactNode;
}> = [
  {
    role: "ADMIN",
    title: "Administradores",
    description: "Acceso total al sistema",
    accent: "border-amber-200 bg-amber-50 text-amber-700",
    icon: <ShieldIcon />
  },
  {
    role: "WAITER",
    title: "Camareros",
    description: "Toma pedidos y cobra",
    accent: "border-blue-200 bg-blue-50 text-blue-700",
    icon: <UserIcon />
  },
  {
    role: "KITCHEN",
    title: "Cocina",
    description: "Ve y gestiona pedidos",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <ChefHatIcon />
  }
];

export default function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<UserFormState | null>(null);
  const [deleteModal, setDeleteModal] = useState<UserItem | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!modal) {
      return;
    }

    window.setTimeout(() => {
      pinRefs.current[0]?.focus();
    }, 0);
  }, [modal?.id]);

  async function loadUsers() {
    try {
      const nextUsers = await api.get<UserItem[]>("/users");
      setUsers(nextUsers);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios";
      setError(message);
      showToast({ type: "error", title: "Usuarios", message });
    } finally {
      setLoading(false);
    }
  }

  const groupedUsers = useMemo(() => {
    return roleSections.map((section) => ({
      ...section,
      users: users.filter((user) => user.role === section.role)
    }));
  }, [users]);

  const currentPin = modal ? modal.pinDigits.join("") : "";
  const duplicatePin =
    currentPin.length === 4 &&
    users.some((user) => user.pin === currentPin && user.id !== modal?.id);

  function openCreateModal() {
    setModal({
      name: "",
      pinDigits: ["", "", "", ""],
      role: "WAITER",
      active: true
    });
    setError(null);
  }

  function openEditModal(user: UserItem) {
    setModal({
      id: user.id,
      name: user.name,
      pinDigits: splitPin(user.pin),
      role: user.role,
      active: user.active
    });
    setError(null);
  }

  function setPinDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);

    setModal((current) => {
      if (!current) {
        return current;
      }

      const nextDigits = [...current.pinDigits] as UserFormState["pinDigits"];
      nextDigits[index] = digit;
      return {
        ...current,
        pinDigits: nextDigits
      };
    });

    if (digit && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }
  }

  function handlePinKeyDown(index: number, key: string) {
    if (key === "Backspace" && modal?.pinDigits[index] === "" && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  }

  function generatePin() {
    for (let attempts = 0; attempts < 100; attempts += 1) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      const exists = users.some((user) => user.pin === candidate && user.id !== modal?.id);

      if (!exists) {
        setModal((current) =>
          current
            ? {
                ...current,
                pinDigits: splitPin(candidate)
              }
            : current
        );
        return;
      }
    }

    const message = "No se pudo generar un PIN libre";
    setError(message);
    showToast({ type: "error", title: "Usuarios", message });
  }

  async function handleSaveUser() {
    if (!modal) {
      return;
    }

    const name = modal.name.trim();
    const pin = modal.pinDigits.join("");

    if (!name) {
      return showInlineError("El nombre es obligatorio");
    }

    if (!/^\d{4}$/.test(pin)) {
      return showInlineError("El PIN debe tener 4 digitos");
    }

    if (duplicatePin) {
      return showInlineError("Ese PIN ya esta en uso");
    }

    if (modal.id === currentUser?.id && !modal.active) {
      return showInlineError("No puedes desactivar tu propio usuario");
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name,
        pin,
        role: modal.role,
        active: modal.active
      };

      if (modal.id) {
        await api.put(`/users/${modal.id}`, payload);
        showToast({
          type: "success",
          title: "Usuarios",
          message: "Usuario actualizado"
        });
      } else {
        await api.post("/users", payload);
        showToast({
          type: "success",
          title: "Usuarios",
          message: "Usuario creado"
        });
      }

      setModal(null);
      await loadUsers();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "No se pudo guardar el usuario";
      setError(message);
      showToast({ type: "error", title: "Usuarios", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(targetUser: UserItem) {
    if (targetUser.id === currentUser?.id) {
      const message = "No puedes desactivar tu propio usuario";
      return showInlineError(message);
    }

    setBusyUserId(targetUser.id);

    try {
      await api.patch(`/users/${targetUser.id}/toggle`);
      await loadUsers();
    } catch (toggleError) {
      const message =
        toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el usuario";
      setError(message);
      showToast({ type: "error", title: "Usuarios", message });
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteUser() {
    if (!deleteModal) {
      return;
    }

    if (deleteModal.id === currentUser?.id) {
      return showInlineError("No puedes eliminar tu propio usuario");
    }

    setSaving(true);

    try {
      await api.delete(`/users/${deleteModal.id}`);
      showToast({
        type: "success",
        title: "Usuarios",
        message: "Usuario eliminado"
      });
      setDeleteModal(null);
      await loadUsers();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el usuario";
      setError(message);
      showToast({ type: "error", title: "Usuarios", message });
    } finally {
      setSaving(false);
    }
  }

  function showInlineError(message: string) {
    setError(message);
    showToast({ type: "warning", title: "Usuarios", message });
  }

  return (
    <section className="space-y-6 page-enter">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Usuarios</h1>
          <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
            Gestiona el equipo y los codigos de acceso
          </p>
        </div>

        <button
          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
          onClick={openCreateModal}
          type="button"
        >
          <span className="text-base">+</span>
          Nuevo usuario
        </button>
      </header>

      {error ? (
        <div className="surface-card border-l-4 border-l-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="surface-card p-5" key={index}>
              <div className="h-5 w-32 animate-pulse rounded bg-[var(--color-surface-muted)]" />
              <div className="mt-4 h-16 w-full animate-pulse rounded bg-[var(--color-surface-muted)]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedUsers.map((section) => (
            <section className="space-y-4" key={section.role}>
              <div className="flex items-center gap-3">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${section.accent}`}>
                  {section.icon}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">{section.title}</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {section.users.length} usuario{section.users.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>

              {section.users.length === 0 ? (
                <div className="surface-card px-5 py-4 text-sm text-[var(--color-text-muted)]">
                  No hay usuarios en esta seccion.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {section.users.map((item) => {
                    const isCurrentUser = item.id === currentUser?.id;
                    const isBusy = busyUserId === item.id;

                    return (
                      <article
                        className={`surface-card p-5 transition-all duration-200 ${item.active ? "" : "opacity-50"}`}
                        key={item.id}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-4">
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                              style={{ backgroundColor: getAvatarColor(item.name) }}
                            >
                              {getInitials(item.name)}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-[var(--color-text)]">
                                {item.name} {isCurrentUser ? "(Tu usuario)" : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="mono rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-semibold text-[var(--color-text)]">
                                  {item.pin}
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getRoleBadgeClass(item.role)}`}>
                                  {getRoleLabel(item.role)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            aria-label={`Cambiar estado de ${item.name}`}
                            className={`relative h-7 w-12 rounded-full transition-all duration-200 ${
                              item.active ? "bg-emerald-500" : "bg-[#ddd6cb]"
                            }`}
                            disabled={isCurrentUser || isBusy}
                            onClick={() => void handleToggleActive(item)}
                            type="button"
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                                item.active ? "left-6" : "left-1"
                              }`}
                            />
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Alta {new Date(item.createdAt).toLocaleDateString("es-ES")}
                          </p>

                          <div className="flex items-center gap-2">
                            <button
                              aria-label={`Editar usuario ${item.name}`}
                              className="btn-ghost min-h-11 px-3 py-2 text-sm font-medium"
                              onClick={() => openEditModal(item)}
                              type="button"
                            >
                              Editar
                            </button>
                            <button
                              aria-label={`Eliminar usuario ${item.name}`}
                              className="btn-danger min-h-11 px-3 py-2 text-sm font-medium disabled:opacity-50"
                              disabled={isCurrentUser}
                              onClick={() => setDeleteModal(item)}
                              type="button"
                            >
                              {isBusy ? <Spinner className="h-4 w-4" /> : "Eliminar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {modal ? (
        <ModalCard onClose={() => setModal(null)} title={modal.id ? "Editar usuario" : "Nuevo usuario"}>
          <div className="space-y-5">
            <Field label="Nombre" required>
              <input
                className="field-input"
                onChange={(event) =>
                  setModal((current) => (current ? { ...current, name: event.target.value } : current))
                }
                placeholder="Nombre completo"
                value={modal.name}
              />
            </Field>

            <Field label="PIN" required>
              <div className="flex gap-2">
                {modal.pinDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      pinRefs.current[index] = element;
                    }}
                    className={`h-14 w-14 rounded-xl border text-center text-xl font-semibold outline-none transition-all duration-200 ${
                      duplicatePin
                        ? "border-red-300 bg-red-50"
                        : "border-[var(--color-border)] bg-white focus:border-[rgba(232,93,42,0.65)] focus:shadow-[0_0_0_4px_rgba(232,93,42,0.12)]"
                    }`}
                    inputMode="numeric"
                    maxLength={1}
                    onChange={(event) => setPinDigit(index, event.target.value)}
                    onKeyDown={(event) => handlePinKeyDown(index, event.key)}
                    value={digit}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className={`text-sm ${duplicatePin ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"}`}>
                  {duplicatePin ? "Ese PIN ya existe" : "Introduce 4 digitos unicos"}
                </p>
                <button
                  className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium"
                  onClick={generatePin}
                  type="button"
                >
                  Generar PIN aleatorio
                </button>
              </div>
            </Field>

            <Field label="Rol" required>
              <div className="grid gap-3">
                {roleSections.map((roleOption) => (
                  <button
                    key={roleOption.role}
                    className={`rounded-xl border px-4 py-4 text-left transition-all duration-200 ${
                      modal.role === roleOption.role
                        ? "border-[var(--color-primary)] bg-orange-50"
                        : "border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-muted)]"
                    }`}
                    onClick={() =>
                      setModal((current) =>
                        current ? { ...current, role: roleOption.role } : current
                      )
                    }
                    type="button"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${roleOption.accent}`}>
                        {roleOption.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {getRoleLabel(roleOption.role)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                          {roleOption.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Activo</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Si esta apagado, no podra acceder al sistema.
                  </p>
                </div>
                <button
                  aria-label="Cambiar estado activo"
                  className={`relative h-7 w-12 rounded-full transition-all duration-200 ${
                    modal.active ? "bg-emerald-500" : "bg-[#ddd6cb]"
                  }`}
                  disabled={modal.id === currentUser?.id}
                  onClick={() =>
                    setModal((current) =>
                      current ? { ...current, active: !current.active } : current
                    )
                  }
                  type="button"
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                      modal.active ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Si cambias el PIN de un usuario que ya ha iniciado sesion en otro dispositivo,
              esa sesion seguira activa hasta que expire su JWT de 12 horas.
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-primary min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving || duplicatePin}
              onClick={() => void handleSaveUser()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : "Guardar"}
            </button>
          </div>
        </ModalCard>
      ) : null}

      {deleteModal ? (
        <ModalCard onClose={() => setDeleteModal(null)} title="Eliminar usuario">
          <div className="space-y-3">
            <p className="text-base font-semibold text-[var(--color-text)]">
              ¿Eliminar a {deleteModal.name}?
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Ya no podra acceder al sistema.
            </p>
            {deleteModal.id === currentUser?.id ? (
              <p className="text-sm text-[var(--color-danger)]">
                No puedes eliminar al usuario actualmente logueado.
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary min-h-11 px-4 py-2.5 text-sm font-medium" onClick={() => setDeleteModal(null)} type="button">
              Cancelar
            </button>
            <button
              className="btn-danger min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              disabled={saving || deleteModal.id === currentUser?.id}
              onClick={() => void handleDeleteUser()}
              type="button"
            >
              {saving ? <Spinner className="h-4 w-4" label="Eliminando" /> : "Eliminar"}
            </button>
          </div>
        </ModalCard>
      ) : null}
    </section>
  );
}

function Field(props: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
        {props.label} {props.required ? <span className="text-[var(--color-danger)]">*</span> : null}
      </span>
      {props.children}
    </label>
  );
}

function ModalCard(props: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 backdrop-blur-sm md:items-center md:justify-center">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 md:px-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{props.title}</h2>
          <button className="btn-ghost min-h-11 px-3 py-2 text-sm" onClick={props.onClose} type="button">
            Cerrar
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 md:px-6 md:py-6">{props.children}</div>
      </div>
    </div>
  );
}

function splitPin(pin: string): [string, string, string, string] {
  const digits = pin.padEnd(4).slice(0, 4).split("") as [string, string, string, string];
  return digits;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  if (parts.length === 0) {
    return "??";
  }

  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }

  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const palette = ["#E85D2A", "#2563EB", "#16A34A", "#9333EA", "#C2410C", "#0F766E"];
  let hash = 0;
  for (const character of name) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getRoleBadgeClass(role: UserRole) {
  if (role === "ADMIN") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (role === "KITCHEN") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getRoleLabel(role: UserRole) {
  if (role === "ADMIN") {
    return "Administrador";
  }

  if (role === "WAITER") {
    return "Camarero/a";
  }

  return "Cocina";
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 3 5 6v5c0 4.6 3 8.8 7 10 4-1.2 7-5.4 7-10V6l-7-3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChefHatIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M7 10a3 3 0 0 1 0-6 4 4 0 0 1 5 1 4 4 0 0 1 7 2 3 3 0 0 1-1 5H7Zm1 0v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
