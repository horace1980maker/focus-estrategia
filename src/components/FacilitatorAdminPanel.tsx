"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OrganizationOption = {
  id: string;
  name: string;
};

type UserOption = {
  id: string;
  name: string;
  username: string | null;
  role: string;
  organizationId: string | null;
};

type OrganizationGuidance = {
  facilitatorName: string;
  message: string;
  currentTasks: string[];
  pendingTasks: string[];
  updatedAt: string | null;
};

type FacilitatorAdminPanelProps = {
  lang: "es" | "en";
  organizations: OrganizationOption[];
  users: UserOption[];
  guidanceByOrganization: Record<string, OrganizationGuidance>;
  strategicCoachVisible: boolean;
  exampleLibraryVisible: boolean;
  workingDraftVisible: boolean;
};

type PanelStatus = {
  type: "success" | "error";
  message: string;
} | null;

const COPY = {
  es: {
    title: "Administracion de Organizaciones",
    subtitle:
      "Crea organizaciones, provisiona credenciales de administracion y restablece contenido operativo.",
    createTitle: "Crear organizacion",
    createName: "Nombre",
    createCountry: "Pais (opcional)",
    createDescription: "Descripcion (opcional)",
    createSubmit: "Crear organizacion",
    provisionTitle: "Provisionar admin de organizacion",
    organization: "Organizacion",
    username: "Usuario",
    displayName: "Nombre visible",
    password: "Contrasena inicial",
    mustChange: "Forzar cambio de contrasena al primer ingreso",
    provisionSubmit: "Provisionar credenciales",
    resetTitle: "Restablecer contenido de organizacion",
    resetWarning:
      'Esta accion elimina avances de trabajo (fases, borradores, validaciones, entregables, analitica) y reabre la organizacion en Fase 1. Escribe "RESET" para confirmar.',
    resetConfirmLabel: 'Confirmacion (escribe "RESET")',
    resetSubmit: "Restablecer contenido",
    timeResetTitle: "Restablecer tiempo en plataforma",
    timeResetWarning:
      'Esta accion borra solo el tiempo registrado (minutos y sesiones) de la organizacion. Conserva fases, borradores, validaciones, entregables y tareas. Escribe "RESET TIME" para confirmar.',
    timeResetConfirmLabel: 'Confirmacion (escribe "RESET TIME")',
    timeResetSubmit: "Restablecer tiempo",
    guidanceTitle: "Mensaje y tareas para organizacion",
    guidanceSubtitle:
      "Actualiza el mensaje del facilitador y la lista de tareas visibles en el dashboard de la ONG.",
    guidanceName: "Nombre del facilitador",
    guidanceMessage: "Mensaje para la organizacion",
    guidanceCurrent: "Tareas actuales (una por linea)",
    guidancePending: "Tareas pendientes (una por linea)",
    guidanceSubmit: "Guardar mensaje y tareas",
    successGuidance: "Mensaje y tareas actualizados.",
    coachToggleTitle: "Visibilidad de Acompañante estratégico",
    coachToggleSubtitle:
      "Controla si la sección de Acompañante estratégico se muestra en dashboards y fases de todas las organizaciones.",
    coachToggleLabel: "Mostrar sección de Acompañante estratégico",
    coachToggleSubmit: "Guardar visibilidad",
    successCoachToggle: "Visibilidad de Acompañante estratégico actualizada.",
    exampleLibraryToggleTitle: "Visibilidad de Biblioteca de ejemplos",
    exampleLibraryToggleSubtitle:
      "Controla si la seccion Biblioteca de ejemplos se muestra en todas las organizaciones.",
    exampleLibraryToggleLabel: "Mostrar seccion Biblioteca de ejemplos",
    exampleLibraryToggleSubmit: "Guardar visibilidad",
    successExampleLibraryToggle: "Visibilidad de Biblioteca de ejemplos actualizada.",
    workingDraftToggleTitle: "Visibilidad de Borrador de trabajo",
    workingDraftToggleSubtitle:
      "Controla si la seccion Borrador de trabajo se muestra en todas las organizaciones.",
    workingDraftToggleLabel: "Mostrar seccion Borrador de trabajo",
    workingDraftToggleSubmit: "Guardar visibilidad",
    successWorkingDraftToggle: "Visibilidad de Borrador de trabajo actualizada.",
    removeUserTitle: "Eliminar usuario",
    removeUserSubtitle:
      'Desactiva y elimina acceso de un usuario de organizacion. Escribe "DELETE" para confirmar.',
    removeUserSelect: "Usuario",
    removeUserConfirmLabel: 'Confirmacion (escribe "DELETE")',
    removeUserSubmit: "Eliminar usuario",
    successRemoveUser: "Usuario eliminado correctamente.",
    removeOrganizationTitle: "Eliminar organizacion",
    removeOrganizationWarning:
      'Esta accion elimina la organizacion del sistema y desactiva sus usuarios. Escribe "DELETE" para confirmar.',
    removeOrganizationConfirmLabel: 'Confirmacion (escribe "DELETE")',
    removeOrganizationSubmit: "Eliminar organizacion",
    successRemoveOrganization: "Organizacion eliminada correctamente.",
    noUsers: "No hay usuarios en la organizacion seleccionada.",
    successCreate: "Organizacion creada correctamente.",
    successProvision: "Credenciales provisionadas correctamente.",
    successReset: "Contenido de la organizacion restablecido.",
    successTimeReset: "Tiempo en plataforma restablecido correctamente.",
    unknownError: "No se pudo completar la accion.",
    noOrganizations: "No hay organizaciones disponibles.",
  },
  en: {
    title: "Organization Administration",
    subtitle:
      "Create organizations, provision admin credentials, and reset organization operational content.",
    createTitle: "Create organization",
    createName: "Name",
    createCountry: "Country (optional)",
    createDescription: "Description (optional)",
    createSubmit: "Create organization",
    provisionTitle: "Provision organization admin",
    organization: "Organization",
    username: "Username",
    displayName: "Display name",
    password: "Initial password",
    mustChange: "Require password change on first sign-in",
    provisionSubmit: "Provision credentials",
    resetTitle: "Reset organization content",
    resetWarning:
      'This action clears workflow progress (phases, drafts, validation, deliverables, analytics) and returns the organization to Phase 1. Type "RESET" to confirm.',
    resetConfirmLabel: 'Confirmation (type "RESET")',
    resetSubmit: "Reset content",
    timeResetTitle: "Reset platform time",
    timeResetWarning:
      'This action clears only the recorded time (minutes and sessions) for the organization. It keeps phases, drafts, validation, deliverables, and tasks. Type "RESET TIME" to confirm.',
    timeResetConfirmLabel: 'Confirmation (type "RESET TIME")',
    timeResetSubmit: "Reset time",
    guidanceTitle: "Organization message and tasks",
    guidanceSubtitle:
      "Update the facilitator message and task list shown in the NGO dashboard.",
    guidanceName: "Facilitator name",
    guidanceMessage: "Message for organization",
    guidanceCurrent: "Current tasks (one per line)",
    guidancePending: "Pending tasks (one per line)",
    guidanceSubmit: "Save message and tasks",
    successGuidance: "Message and tasks updated.",
    coachToggleTitle: "Strategic coach visibility",
    coachToggleSubtitle:
      "Control whether the strategic coach section appears across all organization dashboards and phases.",
    coachToggleLabel: "Show strategic coach section",
    coachToggleSubmit: "Save visibility",
    successCoachToggle: "Strategic coach visibility updated.",
    exampleLibraryToggleTitle: "Example library visibility",
    exampleLibraryToggleSubtitle:
      "Control whether the Example library section appears for all organizations.",
    exampleLibraryToggleLabel: "Show Example library section",
    exampleLibraryToggleSubmit: "Save visibility",
    successExampleLibraryToggle: "Example library visibility updated.",
    workingDraftToggleTitle: "Working draft visibility",
    workingDraftToggleSubtitle:
      "Control whether the Working draft section appears for all organizations.",
    workingDraftToggleLabel: "Show Working draft section",
    workingDraftToggleSubmit: "Save visibility",
    successWorkingDraftToggle: "Working draft visibility updated.",
    removeUserTitle: "Remove user",
    removeUserSubtitle:
      'Disable and remove access for an organization user. Type "DELETE" to confirm.',
    removeUserSelect: "User",
    removeUserConfirmLabel: 'Confirmation (type "DELETE")',
    removeUserSubmit: "Remove user",
    successRemoveUser: "User removed successfully.",
    removeOrganizationTitle: "Remove organization",
    removeOrganizationWarning:
      'This action removes the organization from the system and deactivates its users. Type "DELETE" to confirm.',
    removeOrganizationConfirmLabel: 'Confirmation (type "DELETE")',
    removeOrganizationSubmit: "Remove organization",
    successRemoveOrganization: "Organization removed successfully.",
    noUsers: "No users available in the selected organization.",
    successCreate: "Organization created successfully.",
    successProvision: "Credentials provisioned successfully.",
    successReset: "Organization content reset successfully.",
    successTimeReset: "Platform time reset successfully.",
    unknownError: "The action could not be completed.",
    noOrganizations: "No organizations available.",
  },
} as const;

type FacilitatorAdminCopy = (typeof COPY)[keyof typeof COPY];

function toErrorMessage(copy: FacilitatorAdminCopy, payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return copy.unknownError;
}

export function FacilitatorAdminPanel({
  lang,
  organizations: initialOrganizations,
  users: initialUsers,
  guidanceByOrganization: initialGuidanceByOrganization,
  strategicCoachVisible: initialStrategicCoachVisible,
  exampleLibraryVisible: initialExampleLibraryVisible,
  workingDraftVisible: initialWorkingDraftVisible,
}: FacilitatorAdminPanelProps) {
  const copy = COPY[lang];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>(initialOrganizations);
  const [users, setUsers] = useState<UserOption[]>(initialUsers);
  const [guidanceByOrganization, setGuidanceByOrganization] = useState<
    Record<string, OrganizationGuidance>
  >(initialGuidanceByOrganization);
  const [strategicCoachVisible, setStrategicCoachVisible] = useState<boolean>(
    initialStrategicCoachVisible,
  );
  const [exampleLibraryVisible, setExampleLibraryVisible] = useState<boolean>(
    initialExampleLibraryVisible,
  );
  const [workingDraftVisible, setWorkingDraftVisible] = useState<boolean>(
    initialWorkingDraftVisible,
  );
  const [status, setStatus] = useState<PanelStatus>(null);

  const uniqueOrganizations = useMemo(() => {
    const map = new Map<string, OrganizationOption>();
    for (const org of organizations) {
      if (!Array.from(map.values()).some((o) => o.name === org.name)) {
        map.set(org.id, org);
      }
    }
    return Array.from(map.values());
  }, [organizations]);

  const hasOrganizations = uniqueOrganizations.length > 0;
  const defaultOrganizationId = useMemo(
    () => uniqueOrganizations[0]?.id ?? "",
    [uniqueOrganizations],
  );
  const [guidanceOrganizationId, setGuidanceOrganizationId] =
    useState<string>(defaultOrganizationId);
  const [removeUserOrganizationId, setRemoveUserOrganizationId] =
    useState<string>(defaultOrganizationId);
  const [removeOrganizationId, setRemoveOrganizationId] =
    useState<string>(defaultOrganizationId);
  const [resetTimeOrganizationId, setResetTimeOrganizationId] =
    useState<string>(defaultOrganizationId);
  const usersByOrganization = useMemo(
    () =>
      users.filter(
        (user) =>
          user.organizationId !== null &&
          uniqueOrganizations.some((organization) => organization.id === user.organizationId),
      ),
    [users, uniqueOrganizations],
  );
  const selectableUsers = useMemo(
    () =>
      usersByOrganization.filter(
        (user) => user.organizationId === (removeUserOrganizationId || defaultOrganizationId),
      ),
    [defaultOrganizationId, removeUserOrganizationId, usersByOrganization],
  );
  const [removeUserId, setRemoveUserId] = useState<string>(selectableUsers[0]?.id ?? "");
  const selectedGuidanceOrganizationId = guidanceOrganizationId || defaultOrganizationId;
  useEffect(() => {
    if (!guidanceOrganizationId && defaultOrganizationId) {
      setGuidanceOrganizationId(defaultOrganizationId);
    }
  }, [defaultOrganizationId, guidanceOrganizationId]);

  useEffect(() => {
    if (!removeUserOrganizationId && defaultOrganizationId) {
      setRemoveUserOrganizationId(defaultOrganizationId);
    }
  }, [defaultOrganizationId, removeUserOrganizationId]);
  useEffect(() => {
    if (!removeOrganizationId && defaultOrganizationId) {
      setRemoveOrganizationId(defaultOrganizationId);
    }
  }, [defaultOrganizationId, removeOrganizationId]);
  useEffect(() => {
    if (!resetTimeOrganizationId && defaultOrganizationId) {
      setResetTimeOrganizationId(defaultOrganizationId);
    }
  }, [defaultOrganizationId, resetTimeOrganizationId]);
  useEffect(() => {
    if (selectableUsers.length === 0) {
      setRemoveUserId("");
      return;
    }
    if (!selectableUsers.some((user) => user.id === removeUserId)) {
      setRemoveUserId(selectableUsers[0]?.id ?? "");
    }
  }, [removeUserId, selectableUsers]);
  const selectedGuidance =
    guidanceByOrganization[selectedGuidanceOrganizationId] ?? {
      facilitatorName: lang === "es" ? "Horacio Narváez-Mena" : "Horacio Narváez-Mena",
      message: "",
      currentTasks: [],
      pendingTasks: [],
      updatedAt: null,
    };

  return (
    <section className="facilitator-admin">
      <header className="facilitator-admin-header">
        <h3>{copy.title}</h3>
        <p>{copy.subtitle}</p>
      </header>

      {status ? (
        <p
          className={`facilitator-admin-status ${
            status.type === "error" ? "error" : "success"
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <div className="facilitator-admin-grid">
        <form
          className="facilitator-admin-card"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const name = String(formData.get("name") ?? "").trim();
            const country = String(formData.get("country") ?? "").trim();
            const description = String(formData.get("description") ?? "").trim();

            startTransition(async () => {
              const response = await fetch("/api/admin/organizations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name,
                  country: country.length > 0 ? country : null,
                  description: description.length > 0 ? description : null,
                }),
              });
              const payload = (await response.json()) as
                | { organization?: OrganizationOption; error?: string }
                | undefined;

              if (!response.ok || !payload?.organization) {
                setStatus({ type: "error", message: toErrorMessage(copy, payload) });
                return;
              }

              const createdOrganization = payload.organization;
              setOrganizations((previous) =>
                [...previous, createdOrganization].sort((left, right) =>
                  left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
                ),
              );
              setGuidanceByOrganization((previous) => ({
                ...previous,
                [createdOrganization.id]: {
                  facilitatorName: "Horacio Narváez-Mena",
                  message: "",
                  currentTasks: [],
                  pendingTasks: [],
                  updatedAt: null,
                },
              }));
              if (!guidanceOrganizationId) {
                setGuidanceOrganizationId(createdOrganization.id);
              }
              if (!removeUserOrganizationId) {
                setRemoveUserOrganizationId(createdOrganization.id);
              }
              if (!removeOrganizationId) {
                setRemoveOrganizationId(createdOrganization.id);
              }
              if (!resetTimeOrganizationId) {
                setResetTimeOrganizationId(createdOrganization.id);
              }
              form.reset();
              setStatus({ type: "success", message: copy.successCreate });
              router.refresh();
            });
          }}
        >
          <h4>{copy.createTitle}</h4>
          <label>
            <span>{copy.createName}</span>
            <input name="name" className="input" required />
          </label>
          <label>
            <span>{copy.createCountry}</span>
            <input name="country" className="input" />
          </label>
          <label>
            <span>{copy.createDescription}</span>
            <textarea name="description" className="input facilitator-admin-textarea" rows={3} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {copy.createSubmit}
          </button>
        </form>

        <form
          className="facilitator-admin-card"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const organizationId = String(formData.get("organizationId") ?? "").trim();
            const username = String(formData.get("username") ?? "").trim();
            const name = String(formData.get("displayName") ?? "").trim();
            const password = String(formData.get("password") ?? "");
            const mustChangePassword = formData.get("mustChangePassword") === "on";

            startTransition(async () => {
              const response = await fetch("/api/auth/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organizationId,
                  username,
                  name,
                  role: "ngo_admin",
                  password,
                  mustChangePassword,
                }),
              });
              const payload = (await response.json()) as
                | {
                    user?: {
                      id: string;
                      name: string;
                      username: string | null;
                      role: string;
                      organizationId: string | null;
                    };
                    error?: string;
                  }
                | undefined;
              if (!response.ok || !payload?.user) {
                setStatus({ type: "error", message: toErrorMessage(copy, payload) });
                return;
              }

              setUsers((previous) =>
                [...previous.filter((user) => user.id !== payload.user!.id), payload.user!].sort(
                  (left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
                ),
              );
              form.reset();
              setStatus({ type: "success", message: copy.successProvision });
              router.refresh();
            });
          }}
        >
          <h4>{copy.provisionTitle}</h4>
          <label>
            <span>{copy.organization}</span>
            <select
              name="organizationId"
              className="input"
              defaultValue={defaultOrganizationId}
              required
              disabled={!hasOrganizations}
            >
              {uniqueOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.username}</span>
            <input name="username" className="input" required />
          </label>
          <label>
            <span>{copy.displayName}</span>
            <input name="displayName" className="input" required />
          </label>
          <label>
            <span>{copy.password}</span>
            <input name="password" type="password" className="input" required />
          </label>
          <label className="facilitator-admin-checkbox">
            <input name="mustChangePassword" type="checkbox" defaultChecked />
            <span>{copy.mustChange}</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || !hasOrganizations}
          >
            {copy.provisionSubmit}
          </button>
          {!hasOrganizations ? <p className="metric-sub">{copy.noOrganizations}</p> : null}
        </form>

      <form
        className="facilitator-admin-card facilitator-admin-guidance facilitator-admin-card-wide"
        key={`guidance-${selectedGuidanceOrganizationId}-${selectedGuidance.updatedAt ?? "none"}`}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const organizationId = String(formData.get("organizationId") ?? "").trim();
          const facilitatorName = String(formData.get("facilitatorName") ?? "").trim();
          const message = String(formData.get("message") ?? "");
          const currentTasksRaw = String(formData.get("currentTasksRaw") ?? "");
          const pendingTasksRaw = String(formData.get("pendingTasksRaw") ?? "");

          startTransition(async () => {
            const response = await fetch(`/api/admin/organizations/${organizationId}/guidance`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                facilitatorName,
                message,
                currentTasksRaw,
                pendingTasksRaw,
              }),
            });
            const payload = (await response.json()) as
              | {
                  guidance?: {
                    facilitatorName: string;
                    message: string;
                    currentTasks: string[];
                    pendingTasks: string[];
                    updatedAt: string | null;
                  };
                  error?: string;
                }
              | undefined;

            if (!response.ok || !payload?.guidance) {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            const guidance = payload.guidance;
            setGuidanceOrganizationId(organizationId);
            setGuidanceByOrganization((previous) => ({
              ...previous,
              [organizationId]: guidance,
            }));
            setStatus({ type: "success", message: copy.successGuidance });
            router.refresh();
          });
        }}
      >
        <h4>{copy.guidanceTitle}</h4>
        <p className="facilitator-admin-card-subtitle">{copy.guidanceSubtitle}</p>
        <label>
          <span>{copy.organization}</span>
          <select
            name="organizationId"
            className="input"
            value={selectedGuidanceOrganizationId}
            onChange={(event) => setGuidanceOrganizationId(event.target.value)}
            required
            disabled={!hasOrganizations}
          >
            {uniqueOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.guidanceName}</span>
          <input
            name="facilitatorName"
            className="input"
            defaultValue={selectedGuidance.facilitatorName}
            required
            disabled={!hasOrganizations}
          />
        </label>
        <label>
          <span>{copy.guidanceMessage}</span>
          <textarea
            name="message"
            className="input facilitator-admin-textarea"
            rows={3}
            defaultValue={selectedGuidance.message}
            disabled={!hasOrganizations}
          />
        </label>
        <label>
          <span>{copy.guidanceCurrent}</span>
          <textarea
            name="currentTasksRaw"
            className="input facilitator-admin-textarea"
            rows={4}
            defaultValue={selectedGuidance.currentTasks.join("\n")}
            disabled={!hasOrganizations}
          />
        </label>
        <label>
          <span>{copy.guidancePending}</span>
          <textarea
            name="pendingTasksRaw"
            className="input facilitator-admin-textarea"
            rows={4}
            defaultValue={selectedGuidance.pendingTasks.join("\n")}
            disabled={!hasOrganizations}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending || !hasOrganizations}
        >
          {copy.guidanceSubmit}
        </button>
        {!hasOrganizations ? <p className="metric-sub">{copy.noOrganizations}</p> : null}
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-guidance facilitator-admin-toggle-card"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const response = await fetch("/api/admin/platform-settings/strategic-coach", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isVisible: strategicCoachVisible }),
            });
            const payload = (await response.json()) as
              | { strategicCoachVisible?: boolean; error?: string }
              | undefined;

            if (!response.ok || typeof payload?.strategicCoachVisible !== "boolean") {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            setStrategicCoachVisible(payload.strategicCoachVisible);
            setStatus({ type: "success", message: copy.successCoachToggle });
            router.refresh();
          });
        }}
      >
        <h4>{copy.coachToggleTitle}</h4>
        <p className="facilitator-admin-card-subtitle">{copy.coachToggleSubtitle}</p>
        <div className="facilitator-admin-toggle-row">
          <label className="facilitator-admin-checkbox facilitator-admin-toggle-switch">
            <input
              className="facilitator-admin-toggle-input"
              type="checkbox"
              checked={strategicCoachVisible}
              onChange={(event) => setStrategicCoachVisible(event.currentTarget.checked)}
              disabled={isPending}
            />
            <span>{copy.coachToggleLabel}</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary facilitator-admin-toggle-button"
            disabled={isPending}
          >
            {copy.coachToggleSubmit}
          </button>
        </div>
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-guidance facilitator-admin-toggle-card"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const response = await fetch("/api/admin/platform-settings/example-library", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isVisible: exampleLibraryVisible }),
            });
            const payload = (await response.json()) as
              | { exampleLibraryVisible?: boolean; error?: string }
              | undefined;

            if (!response.ok || typeof payload?.exampleLibraryVisible !== "boolean") {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            setExampleLibraryVisible(payload.exampleLibraryVisible);
            setStatus({ type: "success", message: copy.successExampleLibraryToggle });
            router.refresh();
          });
        }}
      >
        <h4>{copy.exampleLibraryToggleTitle}</h4>
        <p className="facilitator-admin-card-subtitle">{copy.exampleLibraryToggleSubtitle}</p>
        <div className="facilitator-admin-toggle-row">
          <label className="facilitator-admin-checkbox facilitator-admin-toggle-switch">
            <input
              className="facilitator-admin-toggle-input"
              type="checkbox"
              checked={exampleLibraryVisible}
              onChange={(event) => setExampleLibraryVisible(event.currentTarget.checked)}
              disabled={isPending}
            />
            <span>{copy.exampleLibraryToggleLabel}</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary facilitator-admin-toggle-button"
            disabled={isPending}
          >
            {copy.exampleLibraryToggleSubmit}
          </button>
        </div>
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-guidance facilitator-admin-toggle-card"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const response = await fetch("/api/admin/platform-settings/working-draft", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isVisible: workingDraftVisible }),
            });
            const payload = (await response.json()) as
              | { workingDraftVisible?: boolean; error?: string }
              | undefined;

            if (!response.ok || typeof payload?.workingDraftVisible !== "boolean") {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            setWorkingDraftVisible(payload.workingDraftVisible);
            setStatus({ type: "success", message: copy.successWorkingDraftToggle });
            router.refresh();
          });
        }}
      >
        <h4>{copy.workingDraftToggleTitle}</h4>
        <p className="facilitator-admin-card-subtitle">{copy.workingDraftToggleSubtitle}</p>
        <div className="facilitator-admin-toggle-row">
          <label className="facilitator-admin-checkbox facilitator-admin-toggle-switch">
            <input
              className="facilitator-admin-toggle-input"
              type="checkbox"
              checked={workingDraftVisible}
              onChange={(event) => setWorkingDraftVisible(event.currentTarget.checked)}
              disabled={isPending}
            />
            <span>{copy.workingDraftToggleLabel}</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary facilitator-admin-toggle-button"
            disabled={isPending}
          >
            {copy.workingDraftToggleSubmit}
          </button>
        </div>
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-reset facilitator-admin-danger-card"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const organizationId = String(formData.get("organizationId") ?? "").trim();
          const confirmationText = String(formData.get("confirmationText") ?? "");

          startTransition(async () => {
            const response = await fetch(
              `/api/admin/organizations/${organizationId}/time-reset`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmationText }),
              },
            );
            const payload = (await response.json()) as { error?: string } | undefined;
            if (!response.ok) {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            form.reset();
            const organizationLabel =
              organizations.find((organization) => organization.id === organizationId)?.name ??
              organizationId;
            setStatus({
              type: "success",
              message: `${copy.successTimeReset} (${organizationLabel})`,
            });
            router.refresh();
          });
        }}
      >
        <h4>{copy.timeResetTitle}</h4>
        <p className="facilitator-admin-warning">{copy.timeResetWarning}</p>
        <label>
          <span>{copy.organization}</span>
          <select
            name="organizationId"
            className="input"
            value={resetTimeOrganizationId}
            onChange={(event) => setResetTimeOrganizationId(event.target.value)}
            required
            disabled={!hasOrganizations}
          >
            {uniqueOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.timeResetConfirmLabel}</span>
          <input name="confirmationText" className="input" required />
        </label>
        <button
          type="submit"
          className="btn btn-primary facilitator-admin-reset-button"
          disabled={isPending || !hasOrganizations}
        >
          {copy.timeResetSubmit}
        </button>
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-reset facilitator-admin-danger-card"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const userId = String(formData.get("userId") ?? "").trim();
          const confirmationText = String(formData.get("confirmationText") ?? "");

          startTransition(async () => {
            const response = await fetch(`/api/auth/users/${userId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmationText }),
            });
            const payload = (await response.json()) as { error?: string } | undefined;
            if (!response.ok) {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            const removedUser =
              users.find((user) => user.id === userId)?.name ??
              users.find((user) => user.id === userId)?.username ??
              userId;
            setUsers((previous) => previous.filter((user) => user.id !== userId));
            form.reset();
            setStatus({
              type: "success",
              message: `${copy.successRemoveUser} (${removedUser})`,
            });
            router.refresh();
          });
        }}
      >
        <h4>{copy.removeUserTitle}</h4>
        <p className="facilitator-admin-warning">{copy.removeUserSubtitle}</p>
        <label>
          <span>{copy.organization}</span>
          <select
            name="organizationId"
            className="input"
            value={removeUserOrganizationId}
            onChange={(event) => setRemoveUserOrganizationId(event.target.value)}
            required
            disabled={!hasOrganizations}
          >
            {uniqueOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.removeUserSelect}</span>
          <select
            name="userId"
            className="input"
            value={removeUserId}
            onChange={(event) => setRemoveUserId(event.target.value)}
            required
            disabled={selectableUsers.length === 0}
          >
            {selectableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.username ?? user.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.removeUserConfirmLabel}</span>
          <input name="confirmationText" className="input" required />
        </label>
        <button
          type="submit"
          className="btn btn-primary facilitator-admin-reset-button"
          disabled={isPending || selectableUsers.length === 0}
        >
          {copy.removeUserSubmit}
        </button>
        {selectableUsers.length === 0 ? <p className="metric-sub">{copy.noUsers}</p> : null}
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-reset facilitator-admin-danger-card"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const organizationId = String(formData.get("organizationId") ?? "").trim();
          const confirmationText = String(formData.get("confirmationText") ?? "");

          startTransition(async () => {
            const response = await fetch(`/api/admin/organizations/${organizationId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmationText }),
            });
            const payload = (await response.json()) as { error?: string } | undefined;
            if (!response.ok) {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            const removedOrganization =
              organizations.find((organization) => organization.id === organizationId)?.name ??
              organizationId;
            setOrganizations((previous) =>
              previous.filter((organization) => organization.id !== organizationId),
            );
            setUsers((previous) =>
              previous.filter((user) => user.organizationId !== organizationId),
            );
            setGuidanceByOrganization((previous) => {
              const next = { ...previous };
              delete next[organizationId];
              return next;
            });
            if (guidanceOrganizationId === organizationId) {
              setGuidanceOrganizationId("");
            }
            if (removeUserOrganizationId === organizationId) {
              setRemoveUserOrganizationId("");
            }
            if (removeOrganizationId === organizationId) {
              setRemoveOrganizationId("");
            }
            if (resetTimeOrganizationId === organizationId) {
              setResetTimeOrganizationId("");
            }
            form.reset();
            setStatus({
              type: "success",
              message: `${copy.successRemoveOrganization} (${removedOrganization})`,
            });
            router.refresh();
          });
        }}
      >
        <h4>{copy.removeOrganizationTitle}</h4>
        <p className="facilitator-admin-warning">{copy.removeOrganizationWarning}</p>
        <label>
          <span>{copy.organization}</span>
          <select
            name="organizationId"
            className="input"
            value={removeOrganizationId}
            onChange={(event) => setRemoveOrganizationId(event.target.value)}
            required
            disabled={!hasOrganizations}
          >
            {uniqueOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.removeOrganizationConfirmLabel}</span>
          <input name="confirmationText" className="input" required />
        </label>
        <button
          type="submit"
          className="btn btn-primary facilitator-admin-reset-button"
          disabled={isPending || !hasOrganizations}
        >
          {copy.removeOrganizationSubmit}
        </button>
      </form>

      <form
        className="facilitator-admin-card facilitator-admin-reset facilitator-admin-danger-card"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const organizationId = String(formData.get("organizationId") ?? "").trim();
          const confirmationText = String(formData.get("confirmationText") ?? "");

          startTransition(async () => {
            const response = await fetch(`/api/admin/organizations/${organizationId}/reset`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmationText }),
            });
            const payload = (await response.json()) as { error?: string } | undefined;
            if (!response.ok) {
              setStatus({ type: "error", message: toErrorMessage(copy, payload) });
              return;
            }

            form.reset();
            const organizationLabel =
              organizations.find((organization) => organization.id === organizationId)?.name ??
              organizationId;
            setStatus({
              type: "success",
              message: `${copy.successReset} (${organizationLabel})`,
            });
            router.refresh();
          });
        }}
      >
        <h4>{copy.resetTitle}</h4>
        <p className="facilitator-admin-warning">{copy.resetWarning}</p>
        <label>
          <span>{copy.organization}</span>
          <select
            name="organizationId"
            className="input"
            defaultValue={defaultOrganizationId}
            required
            disabled={!hasOrganizations}
          >
            {uniqueOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.resetConfirmLabel}</span>
          <input name="confirmationText" className="input" required />
        </label>
        <button
          type="submit"
          className="btn btn-primary facilitator-admin-reset-button"
          disabled={isPending || !hasOrganizations}
        >
          {copy.resetSubmit}
        </button>
      </form>
      </div>
    </section>
  );
}
