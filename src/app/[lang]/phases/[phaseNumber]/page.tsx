import Link from "next/link";
import { redirect } from "next/navigation";
import DiagnosisSurveyPanel from "@/components/DiagnosisSurveyPanel";
import DeliverablesPanel from "@/components/DeliverablesPanel";
import DraftBuilderPanel from "@/components/DraftBuilderPanel";
import OnboardingPanel from "@/components/OnboardingPanel";
import ValidationPanel from "@/components/ValidationPanel";
import PhaseCoachPanel from "@/components/PhaseCoachPanel";
import PhasePatternDraftPad from "@/components/PhasePatternDraftPad";
import PhaseWorkspaceShell from "@/components/PhaseWorkspaceShell";
import { TelemetryTracker } from "@/components/TelemetryTracker";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildLoginRedirectPath, buildPathWithQuery } from "@/lib/auth-routing";
import { ROLES, hasPermission } from "@/lib/auth";
import { switchSessionOrganizationContext } from "@/lib/auth-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { resolvePhaseWorkspacePageState } from "@/lib/phase-workspace-page-state";
import {
  getExampleLibraryVisibility,
  getStrategicCoachVisibility,
  getWorkingDraftVisibility,
} from "@/lib/platform-settings-service";
import { prisma } from "@/lib/prisma";
import { canAccessPhase, getPhaseStatus } from "@/lib/phases";
import {
  getPhaseWorkspacePanels,
  parsePhaseNumber,
  resolveRolePhaseAccess,
} from "@/lib/phase-workspace-routing";
import { getSessionOrNull } from "@/lib/session";
import { canEditValidation } from "@/lib/validation-access";
import "./phases.css";

function getQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }
  return null;
}

function dedupePendingPhaseItems<T extends { organizationId: string; phaseNumber: number }>(
  items: T[],
) {
  const unique = new Map<string, T>();
  for (const item of items) {
    unique.set(`${item.organizationId}:${item.phaseNumber}`, item);
  }
  return Array.from(unique.values());
}

function decodeReason(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function PhaseWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; phaseNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang, phaseNumber } = await params;
  const query = searchParams ? await searchParams : {};
  const locale = lang as Locale;
  const parsedPhaseNumber = parsePhaseNumber(phaseNumber);
  const blocked = getQueryValue(query.blocked) === "1";
  const blockedReason = blocked ? decodeReason(getQueryValue(query.reason)) : null;
  const selectedPattern = getQueryValue(query.pattern);
  const shouldApplyPattern = getQueryValue(query.applyPattern) === "1";

  if (!parsedPhaseNumber) {
    return <p>{lang === "es" ? "Fase no valida." : "Invalid phase."}</p>;
  }

  if (!isFeatureEnabled("phaseWorkspaces")) {
    return (
      <section className="phase-access-message">
        <h1>{lang === "es" ? "Modulo en despliegue" : "Module rolling out"}</h1>
        <p>
          {lang === "es"
            ? "El flujo de workspaces por fase esta deshabilitado temporalmente."
            : "Phase workspace flow is temporarily disabled."}
        </p>
      </section>
    );
  }

  const [dict, session] = await Promise.all([getDictionary(locale), getSessionOrNull()]);
  if (!session) {
    const nextPath = buildPathWithQuery(`/${lang}/phases/${parsedPhaseNumber}`, query);
    redirect(buildLoginRedirectPath({ locale, nextPath }));
  }
  const canViewAllOrgs = hasPermission(session.role, "canViewAllOrgs");
  const requestedOrganizationId = canViewAllOrgs ? getQueryValue(query.org) : null;
  // For oversight roles, explicit `?org=` deep links must take precedence over session context.
  let organizationId = canViewAllOrgs
    ? requestedOrganizationId ?? session.organizationId
    : session.organizationId;

  if (
    canViewAllOrgs &&
    requestedOrganizationId &&
    session.authMode === "credentials" &&
    requestedOrganizationId !== session.organizationId
  ) {
    try {
      await switchSessionOrganizationContext({
        session,
        organizationId: requestedOrganizationId,
      });
    } catch {
      // Fall back to URL-org rendering even if session context update fails.
    }
    organizationId = requestedOrganizationId;
  }
  const canEditOutputs = hasPermission(session.role, "canEditOrgData");
  const canApprovePhases = hasPermission(session.role, "canApprovePhases");
  const isOrgAdmin = session.role === ROLES.NGO_ADMIN;

  if (!organizationId) {
    const pageState = resolvePhaseWorkspacePageState({
      hasOrganizationId: false,
      hasPhaseStatus: false,
      hasPhase: false,
      accessAllowed: false,
    });

    if (pageState === "missing_org") {
      return (
        <div className="phase-access-message">
          {canViewAllOrgs
            ? lang === "es"
              ? "Selecciona una organizacion desde Panel de Cohorte para abrir workspaces de fase."
              : "Select an organization from Cohort Dashboard to open phase workspaces."
            : lang === "es"
              ? "Este usuario no tiene contexto de organizacion."
              : "This user has no organization context."}
        </div>
      );
    }
  }

  const [phaseStatus, orgAccess, strategicCoachVisible, exampleLibraryVisible, workingDraftVisible] =
    await Promise.all([
      getPhaseStatus(organizationId!),
      canAccessPhase(organizationId!, parsedPhaseNumber),
      getStrategicCoachVisibility(),
      getExampleLibraryVisibility(),
      getWorkingDraftVisibility(),
    ]);
  const access = resolveRolePhaseAccess({
    role: session.role,
    orgAccess,
  });
  const phase = phaseStatus?.phases.find(
    (item: { phaseNumber: number }) => item.phaseNumber === parsedPhaseNumber,
  );

  const pageState = resolvePhaseWorkspacePageState({
    hasOrganizationId: Boolean(organizationId),
    hasPhaseStatus: Boolean(phaseStatus),
    hasPhase: Boolean(phase),
    accessAllowed: access.allowed,
  });

  if (pageState === "missing_tracker") {
    return (
      <div className="phase-access-message">
        {lang === "es" ? "No se encontro el rastreador de fases." : "Phase tracker not found."}
      </div>
    );
  }

  if (pageState === "missing_phase") {
    return (
      <div className="phase-access-message">
        {lang === "es" ? "La fase solicitada no existe." : "Requested phase does not exist."}
      </div>
    );
  }

  if (pageState === "blocked") {
    const fallbackReason =
      lang === "es" ? "Acceso denegado por reglas de progresion." : "Access denied by progression rules.";
    const targetPhase =
      access.currentPhase && access.currentPhase > 0 ? access.currentPhase : parsedPhaseNumber;

    if (targetPhase !== parsedPhaseNumber) {
      const reasonParam = encodeURIComponent(access.reason ?? fallbackReason);
      redirect(`/${lang}/phases/${targetPhase}?blocked=1&reason=${reasonParam}`);
    }

    return (
      <section className="phase-access-message">
        <h1>{lang === "es" ? "Acceso de fase bloqueado" : "Phase access blocked"}</h1>
        <p>{access.reason ?? (lang === "es" ? "Acceso denegado." : "Access denied.")}</p>
        {access.missingOutputs?.length ? (
          <ul>
            {access.missingOutputs.map((output) => (
              <li key={output.outputKey}>
                {dict.outputs?.[output.outputKey as keyof typeof dict.outputs] ?? output.outputLabel} ({output.outputKey})
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={`/${lang}/phases/${access.currentPhase}`} className="phase-next-link">
          {lang === "es"
            ? "Ir a la fase actualmente desbloqueada"
            : "Go to currently unlocked phase"}
        </Link>
      </section>
    );
  }

  const panels = getPhaseWorkspacePanels(parsedPhaseNumber);
  const facilitatorPendingReviewItems = canApprovePhases
    ? dedupePendingPhaseItems(
        (
          await prisma.phase.findMany({
            where: { status: "review_requested" },
            select: {
              phaseNumber: true,
              phaseTracker: {
                select: {
                  organizationId: true,
                  organization: { select: { name: true } },
                },
              },
            },
          })
        ).map((item) => ({
          phaseNumber: item.phaseNumber,
          organizationId: item.phaseTracker.organizationId,
          organizationName: item.phaseTracker.organization.name,
        })),
      )
        .sort((left, right) => {
          const nameOrder = left.organizationName.localeCompare(right.organizationName, undefined, {
            sensitivity: "base",
          });
          if (nameOrder !== 0) {
            return nameOrder;
          }
          return left.phaseNumber - right.phaseNumber;
        })
    : [];
  return (
    <>
      <TelemetryTracker
        sectionKey={`phase-${parsedPhaseNumber}-workspace`}
        phaseNumber={parsedPhaseNumber}
        enabled={Boolean(organizationId)}
      />

      {blockedReason ? (
        <section className="phase-redirect-notice">
          <h2>
            {lang === "es"
              ? "Redireccion a la fase disponible"
              : "Redirected to available phase"}
          </h2>
          <p>{blockedReason}</p>
        </section>
      ) : null}

      <PhaseWorkspaceShell
        lang={locale}
        organizationId={organizationId!}
        phaseNumber={parsedPhaseNumber}
        phaseName={
          dict.phases[`phase${parsedPhaseNumber}` as keyof typeof dict.phases] ??
          (lang === "es" ? `Fase ${parsedPhaseNumber}` : `Phase ${parsedPhaseNumber}`)
        }
        phaseStatus={phase!.status}
        currentPhase={phaseStatus!.currentPhase}
        canEditOutputs={canEditOutputs}
        canApprovePhases={canApprovePhases}
        activeRole={session.role}
        pendingReviewItems={facilitatorPendingReviewItems}
      />

      {isOrgAdmin && panels.showCoachPanel && strategicCoachVisible ? (
        <PhaseCoachPanel
          lang={locale}
          phaseNumber={parsedPhaseNumber}
          role={session.role}
        />
      ) : null}

      {isOrgAdmin && panels.showExampleLibraryPanel && exampleLibraryVisible ? (
        <section className="phase-library-entry">
          <h2>{lang === "es" ? "Biblioteca de ejemplos" : "Example library"}</h2>
          <p>
            {lang === "es"
              ? "Explora patrones relevantes para esta fase y aplicalos al borrador de trabajo."
              : "Browse patterns relevant to this phase and apply them to your working draft."}
          </p>
          <Link
            href={`/${lang}/examples?phase=${parsedPhaseNumber}`}
            className="phase-next-link"
          >
            {lang === "es"
              ? "Abrir ejemplos de esta fase"
              : "Open examples for this phase"}
          </Link>
        </section>
      ) : null}

      {panels.showOnboardingPanel ? (
        <OnboardingPanel
          lang={locale}
          organizationId={organizationId!}
          isEditable={isOrgAdmin}
        />
      ) : null}

      {isOrgAdmin && parsedPhaseNumber !== 1 && !panels.showOnboardingPanel && workingDraftVisible ? (
        <PhasePatternDraftPad
          key={`${organizationId}-${parsedPhaseNumber}-${selectedPattern ?? "none"}-${shouldApplyPattern ? "apply" : "view"}`}
          lang={locale}
          phaseNumber={parsedPhaseNumber}
          role={session.role}
          organizationId={organizationId!}
          initialPatternId={shouldApplyPattern ? selectedPattern : null}
        />
      ) : null}

      {panels.showDraftBuilderPanel && workingDraftVisible ? (
        <DraftBuilderPanel
          lang={locale}
          organizationId={organizationId!}
          role={session.role}
        />
      ) : null}

      {panels.showValidationPanel ? (
        <ValidationPanel
          lang={locale}
          organizationId={organizationId!}
          isEditable={canEditValidation(session.role)}
        />
      ) : null}

      {panels.showDiagnosisPanel && canEditOutputs ? (
        <DiagnosisSurveyPanel lang={locale} organizationId={organizationId!} />
      ) : null}

      {panels.showDeliverablesPanel && isFeatureEnabled("deliverablesLifecycle") ? (
        <DeliverablesPanel
          lang={locale}
          organizationId={organizationId!}
          role={session.role}
        />
      ) : null}
    </>
  );
}
