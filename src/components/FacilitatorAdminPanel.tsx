"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OrganizationOption = {
  id: string;
  name: string;
};

type FacilitatorAdminPanelProps = {
  lang: "es" | "en";
  organizations: OrganizationOption[];
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
    successCreate: "Organizacion creada correctamente.",
    successProvision: "Credenciales provisionadas correctamente.",
    successReset: "Contenido de la organizacion restablecido.",
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
    successCreate: "Organization created successfully.",
    successProvision: "Credentials provisioned successfully.",
    successReset: "Organization content reset successfully.",
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
}: FacilitatorAdminPanelProps) {
  const copy = COPY[lang];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>(initialOrganizations);
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
              const payload = (await response.json()) as { error?: string } | undefined;
              if (!response.ok) {
                setStatus({ type: "error", message: toErrorMessage(copy, payload) });
                return;
              }

              form.reset();
              setStatus({ type: "success", message: copy.successProvision });
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
      </div>

      <form
        className="facilitator-admin-card facilitator-admin-reset"
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
    </section>
  );
}
