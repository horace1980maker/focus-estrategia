import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, FileIcon, SparkleIcon } from "@/components/icons";
import { FacilitatorAdminPanel } from "@/components/FacilitatorAdminPanel";
import { TelemetryTracker } from "@/components/TelemetryTracker";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { getOrganizationMetrics } from "@/lib/analytics";
import { buildLoginRedirectPath, buildPathWithQuery } from "@/lib/auth-routing";
import { ROLES } from "@/lib/auth";
import { TOTAL_PHASES } from "@/lib/phase-model";
import { getPhaseStatus } from "@/lib/phases";
import { prisma } from "@/lib/prisma";
import { getRoleViewContract } from "@/lib/role-dashboard-contracts";
import { getSessionOrNull } from "@/lib/session";
import "./dashboard.css";

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

function toTitleCaseSection(sectionKey: string) {
  return sectionKey
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

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

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const locale = lang === "en" ? "en" : "es";
  const query = searchParams ? await searchParams : {};
  const [dict, session] = await Promise.all([getDictionary(locale), getSessionOrNull()]);

  if (!session) {
    const nextPath = buildPathWithQuery(`/${lang}/dashboard`, query);
    redirect(buildLoginRedirectPath({ locale, nextPath }));
  }

  if (session.role === ROLES.FOCUS_COORDINATOR) {
    redirect(`/${lang}/cohort`);
  }

  const roleContract = getRoleViewContract(session.role);
  const isFacilitator = session.role === ROLES.FACILITATOR;
  const isOrgDashboard = session.role === ROLES.NGO_ADMIN;
  const organizationMouDownloadUrl =
    process.env.NEXT_PUBLIC_ORG_MOU_DOWNLOAD_URL?.trim() || "";
  const hasOrganizationMouDownloadUrl = organizationMouDownloadUrl !== "";
  const showPendingQueue = getQueryValue(query.queue) === "pending";

  const [organization, phaseStatus, facilitatorAdminOrganizations] = await Promise.all([
    session.organizationId
      ? prisma.organization.findUnique({
          where: { id: session.organizationId },
          select: { name: true },
        })
      : null,
    session.organizationId ? getPhaseStatus(session.organizationId) : null,
    roleContract.canAdministerOrganizations
      ? prisma.organization.findMany({
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  let metricsError: string | null = null;
  let organizationMetrics: Awaited<ReturnType<typeof getOrganizationMetrics>> | null = null;
  if (session.organizationId) {
    try {
      organizationMetrics = await getOrganizationMetrics({
        organizationId: session.organizationId,
        days: 30,
      });
    } catch (error) {
      metricsError =
        error instanceof Error ? error.message : "Failed to load organization metrics.";
    }
  }

  const orgName =
    organization?.name ??
    (lang === "es" ? "Organizacion activa" : "Active organization");
  const currentPhase = phaseStatus?.currentPhase ?? 1;
  const approvedPhases =
    phaseStatus?.phases.filter((phase: { status: string }) => phase.status === "approved")
      .length ?? 0;
  const overallProgress =
    approvedPhases > 0
      ? Math.round((approvedPhases / TOTAL_PHASES) * 100)
      : Math.round(((currentPhase - 1) / TOTAL_PHASES) * 100);

  const trackedMinutes = organizationMetrics?.totals.trackedMinutes ?? 0;
  const completedTasks = organizationMetrics?.totals.completedTasks ?? 0;
  const activeSectionsCount = organizationMetrics?.bySection.length ?? 0;
  const trackedHours = trackedMinutes / 60;
  const tasksPerHour = trackedHours > 0 ? completedTasks / trackedHours : 0;
  const topSection = organizationMetrics?.bySection[0]?.sectionKey;
  const deliverableVersion = organizationMetrics?.deliverables.latestVersionNumber;
  const deliverableStatus = organizationMetrics?.deliverables.latestStatus ?? "draft";
  const deliverableReadiness =
    organizationMetrics?.deliverables.readinessStatus ?? "not_ready";
  const deliverablePendingAction =
    organizationMetrics?.deliverables.pendingAction ?? "generate_version";
  const pendingReviewPhases =
    phaseStatus?.phases
      .filter((phase: { status: string }) => phase.status === "review_requested")
      .map((phase: { phaseNumber: number }) => phase.phaseNumber) ?? [];
  const facilitatorPendingReviews = isFacilitator
    ? dedupePendingPhaseItems(
        (
          await prisma.phase.findMany({
            where: { status: "review_requested" },
            select: {
              phaseNumber: true,
              phaseTracker: {
                select: {
                  organizationId: true,
                  organization: {
                    select: { name: true },
                  },
                },
              },
            },
          })
        ).map((phase) => ({
          phaseNumber: phase.phaseNumber,
          organizationId: phase.phaseTracker.organizationId,
          organizationName: phase.phaseTracker.organization.name,
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
  const queueCount = isFacilitator ? facilitatorPendingReviews.length : pendingReviewPhases.length;

  const metricsSubtext = metricsError
    ? lang === "es"
      ? "Analitica temporalmente no disponible."
      : "Analytics data temporarily unavailable."
    : organizationMetrics?.dataState === "empty"
      ? lang === "es"
        ? "Aun no hay actividad registrada."
        : "No engagement activity recorded yet."
      : lang === "es"
        ? "Ultimos 30 dias."
        : "Last 30 days.";

  const ngoTasks = [
    {
      id: "1",
      text:
        lang === "es"
          ? "Completar evaluacion de coherencia estrategica"
          : "Complete strategic coherence assessment",
      done: false,
      due: "Apr 5",
    },
    {
      id: "2",
      text:
        lang === "es"
          ? "Cargar documentos de evidencia"
          : "Upload evidence documents",
      done: false,
      due: "Apr 7",
    },
    {
      id: "3",
      text:
        lang === "es"
          ? "Responder cuestionario de capacidades"
          : "Complete capabilities questionnaire",
      done: false,
      due: "Apr 8",
    },
  ];

  const scorecardItems = isFacilitator
    ? [
        {
          label: lang === "es" ? "Aprobaciones pendientes" : "Pending approvals",
          status: queueCount > 0 ? ("partial" as const) : ("complete" as const),
          value: `${queueCount}`,
        },
        {
          label: lang === "es" ? "Fase activa de seguimiento" : "Current follow-up phase",
          status: "partial" as const,
          value: `${currentPhase}/${TOTAL_PHASES}`,
        },
        {
          label: lang === "es" ? "Tiempo organizacion (30d)" : "Organization time (30d)",
          status: trackedMinutes > 0 ? ("partial" as const) : ("missing" as const),
          value: formatHours(trackedMinutes),
        },
        {
          label: lang === "es" ? "Tareas completadas (30d)" : "Tasks completed (30d)",
          status: completedTasks > 0 ? ("complete" as const) : ("missing" as const),
          value: `${completedTasks}`,
        },
        {
          label: lang === "es" ? "Accion de entregables" : "Deliverables next action",
          status:
            deliverablePendingAction === "none"
              ? ("complete" as const)
              : ("partial" as const),
          value: deliverablePendingAction,
        },
        {
          label: lang === "es" ? "Secciones activas (30d)" : "Active sections (30d)",
          status: activeSectionsCount > 0 ? ("complete" as const) : ("missing" as const),
          value: `${activeSectionsCount}`,
        },
      ]
    : [
        {
          label: lang === "es" ? "Tareas completadas (30d)" : "Tasks completed (30d)",
          status: completedTasks > 0 ? ("complete" as const) : ("missing" as const),
          value: `${completedTasks}`,
        },
        {
          label: lang === "es" ? "Tiempo en plataforma (30d)" : "Platform time (30d)",
          status: trackedMinutes > 0 ? ("partial" as const) : ("missing" as const),
          value: formatHours(trackedMinutes),
        },
        {
          label: lang === "es" ? "Productividad (30d)" : "Productivity (30d)",
          status: tasksPerHour > 0 ? ("complete" as const) : ("partial" as const),
          value: `${tasksPerHour.toFixed(1)} ${lang === "es" ? "tareas/h" : "tasks/h"}`,
        },
        {
          label: lang === "es" ? "Entregables (ultima version)" : "Deliverables (latest version)",
          status:
            deliverableReadiness === "ready_for_review"
              ? ("partial" as const)
              : ("missing" as const),
          value:
            deliverableVersion
              ? `v${deliverableVersion}`
              : lang === "es"
                ? "Sin version"
                : "No version",
        },
      ];

  return (
    <>
      <TelemetryTracker
        sectionKey={
          roleContract.dashboardSurface === "facilitator_review"
            ? "facilitator-dashboard"
            : "ngo-dashboard"
        }
        phaseNumber={currentPhase}
        enabled={Boolean(session.organizationId)}
      />

      <div className="welcome-header">
        <div className="org-name">{orgName}</div>
        <div className="welcome-text">
          {isFacilitator
            ? lang === "es"
              ? "Seguimiento de facilitacion"
              : "Facilitator follow-up"
            : dict.dashboard.welcome}
        </div>
      </div>

      <div className="phase-banner">
        <div className="phase-banner-info">
          <h2>
            {dict.dashboard.current_phase}:{" "}
            {dict.phases[`phase${currentPhase}` as keyof typeof dict.phases]}
          </h2>
          <p>
            {isFacilitator
              ? lang === "es"
                ? "Vista de revision para acompanar avance y aprobaciones."
                : "Review surface to monitor progression and approvals."
              : lang === "es"
                ? "Evaluacion de coherencia, capacidades y brechas estrategicas"
                : "Coherence assessment, capabilities, and strategic gaps"}
          </p>
        </div>
        <div className="phase-tag">
          {lang === "es" ? "Fase" : "Phase"} {currentPhase} / {TOTAL_PHASES}
        </div>
      </div>

      {isFacilitator ? (
        <section
          className={`facilitator-queue${showPendingQueue ? " highlighted" : ""}`}
          id="pending-approvals"
        >
          <h3>
            {lang === "es"
              ? `Aprobaciones pendientes (${queueCount})`
              : `Pending approvals (${queueCount})`}
          </h3>
          <p>
            {lang === "es"
              ? "Revisa solicitudes de fase para desbloquear el avance de organizaciones."
              : "Review phase requests to unblock organization progression."}
          </p>
          {queueCount > 0 ? (
            <div className="facilitator-queue-links">
              {isFacilitator
                ? facilitatorPendingReviews.map((item) => (
                    <Link
                      key={`pending-phase-${item.organizationId}-${item.phaseNumber}`}
                      href={`/${lang}/phases/${item.phaseNumber}?org=${encodeURIComponent(item.organizationId)}`}
                      className="sidebar-link"
                    >
                      {lang === "es"
                        ? `${item.organizationName} · Fase ${item.phaseNumber}`
                        : `${item.organizationName} · Phase ${item.phaseNumber}`}
                      <ChevronRightIcon size={14} />
                    </Link>
                  ))
                : pendingReviewPhases.map((phase) => (
                    <Link key={`pending-phase-${phase}`} href={`/${lang}/phases/${phase}`} className="sidebar-link">
                      {lang === "es" ? `Abrir fase ${phase}` : `Open phase ${phase}`}
                      <ChevronRightIcon size={14} />
                    </Link>
                  ))}
            </div>
          ) : (
            <p className="metric-sub">
              {lang === "es"
                ? "No hay fases en revision solicitada en este momento."
                : "No phases currently in review requested status."}
            </p>
          )}
        </section>
      ) : null}

      {roleContract.canAdministerOrganizations ? (
        <FacilitatorAdminPanel
          lang={lang === "es" ? "es" : "en"}
          organizations={facilitatorAdminOrganizations}
        />
      ) : null}

      <div className="dashboard-grid">
        <div>
          <div className="metrics-row">
            <div className="metric-card">
              <div className="metric-label">{dict.dashboard.overall_progress}</div>
              <div className="metric-value">{overallProgress}%</div>
              <div style={{ marginTop: "var(--space-sm)" }}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">
                {lang === "es" ? "Tiempo en plataforma" : "Time in platform"}
              </div>
              <div className="metric-value">{formatHours(trackedMinutes)}</div>
              <div className="metric-sub">
                {topSection
                  ? lang === "es"
                    ? `Seccion principal: ${toTitleCaseSection(topSection)}`
                    : `Top section: ${toTitleCaseSection(topSection)}`
                  : metricsSubtext}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">
                {lang === "es" ? "Productividad (30d)" : "Productivity (30d)"}
              </div>
              <div className="metric-value">
                {tasksPerHour.toFixed(1)} {lang === "es" ? "tareas/h" : "tasks/h"}
              </div>
              <div className="metric-sub">
                {lang === "es"
                  ? `${completedTasks} tareas en ${formatHours(trackedMinutes)}`
                  : `${completedTasks} tasks in ${formatHours(trackedMinutes)}`}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">{lang === "es" ? "Entregables" : "Deliverables"}</div>
              <div className="metric-value">{deliverableVersion ? `v${deliverableVersion}` : "-"}</div>
              <div className="metric-sub">
                {lang === "es"
                  ? `Estado: ${deliverableStatus} - Readiness: ${deliverableReadiness} - Siguiente: ${deliverablePendingAction}`
                  : `Status: ${deliverableStatus} - Readiness: ${deliverableReadiness} - Next: ${deliverablePendingAction}`}
              </div>
            </div>
          </div>

          {!isFacilitator ? (
            <div className="task-list">
              <h3>{dict.dashboard.what_to_do_now}</h3>
              {ngoTasks.map((task) => (
                <div key={task.id} className="task-item">
                  <div className={`task-check${task.done ? " done" : ""}`} />
                  <span className={`task-text${task.done ? " done" : ""}`}>{task.text}</span>
                  <span className="task-due">{task.due}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="task-list">
              <h3>{lang === "es" ? "Prioridades de seguimiento" : "Follow-up priorities"}</h3>
              <div className="task-item">
                <div className={`task-check${queueCount > 0 ? "" : " done"}`} />
                <span className="task-text">
                  {lang === "es"
                    ? "Revisar solicitudes pendientes por fase"
                    : "Review pending phase requests"}
                </span>
                <span className="task-due">{queueCount}</span>
              </div>
              <div className="task-item">
                <div className={`task-check${trackedMinutes > 0 ? " done" : ""}`} />
                <span className="task-text">
                  {lang === "es"
                    ? "Validar engagement y tareas de la organizacion activa"
                    : "Validate engagement and task completion in active organization"}
                </span>
                <span className="task-due">{completedTasks}</span>
              </div>
              <div className="task-item">
                <div className={`task-check${deliverablePendingAction === "none" ? " done" : ""}`} />
                <span className="task-text">
                  {lang === "es"
                    ? "Confirmar estado de entregables y siguiente accion"
                    : "Confirm deliverables status and next action"}
                </span>
                <span className="task-due">{deliverablePendingAction}</span>
              </div>
            </div>
          )}

          {!isFacilitator ? (
            <div className="facilitator-note">
              <div className="facilitator-note-header">
                <div className="facilitator-avatar">MR</div>
                <span className="facilitator-name">Maria Rodriguez</span>
                <span className="facilitator-date">1 Apr 2026</span>
              </div>
              <p>
                {lang === "es"
                  ? "Excelente avance en la alineacion del equipo. Para la proxima sesion, enfoquense en completar la evaluacion de coherencia estrategica y cargar evidencias."
                  : "Excellent progress in team alignment. Next session: complete coherence assessment and upload evidence."}
              </p>
              <p className="metric-sub" style={{ marginTop: "var(--space-sm)" }}>
                {lang === "es"
                  ? `Prioriza secciones con baja actividad y tareas pendientes para sostener el avance.`
                  : `Prioritize low-activity sections and pending tasks to sustain momentum.`}
              </p>
            </div>
          ) : null}
        </div>

        <div className="sidebar-panel">
          {isOrgDashboard ? (
            <div className="coach-callout">
              <div className="coach-title">
                <SparkleIcon size={16} /> {dict.coach.title}
              </div>
              <p style={{ fontSize: "var(--body-sm)", lineHeight: 1.6 }}>
                {lang === "es"
                  ? "Prioriza secciones con menor tiempo efectivo y menor avance de tareas."
                  : "Prioritize sections with low effective time and low task completion."}
              </p>
            </div>
          ) : null}

          <div className="scorecard">
            <div className="scorecard-title">
              {isFacilitator
                ? lang === "es"
                  ? "Tarjeta de seguimiento"
                  : "Follow-up scorecard"
                : dict.dashboard.scorecard}{" "}
              - {dict.phases[`phase${currentPhase}` as keyof typeof dict.phases]}
            </div>
            {scorecardItems.map((item) => (
              <div key={item.label} className="scorecard-row">
                <div className={`scorecard-status ${item.status}`} />
                <span className="scorecard-label">{item.label}</span>
                <span className="scorecard-value">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="scorecard-title">{dict.dashboard.recent_deliverables}</div>
            <Link
              href={`/${lang}/deliverables`}
              className="sidebar-link"
              style={{ paddingLeft: 0, marginTop: "var(--space-sm)" }}
            >
              <FileIcon size={18} />
              {dict.actions.view_all}
              <ChevronRightIcon size={16} />
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
