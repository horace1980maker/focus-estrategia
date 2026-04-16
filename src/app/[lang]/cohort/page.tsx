import Link from "next/link";
import { TelemetryTracker } from "@/components/TelemetryTracker";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildLoginRedirectPath } from "@/lib/auth-routing";
import { getCohortMetrics } from "@/lib/analytics";
import { ROLES } from "@/lib/auth";
import { TOTAL_PHASES } from "@/lib/phase-model";
import { getSessionOrNull } from "@/lib/session";
import { redirect } from "next/navigation";
import styles from "./cohort.module.css";

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export default async function CohortDashboard({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = lang as Locale;
  const [session, dict] = await Promise.all([getSessionOrNull(), getDictionary(locale)]);
  if (!session) {
    redirect(buildLoginRedirectPath({ locale, nextPath: `/${lang}/cohort` }));
  }
  const copy = dict.cohort;

  if (session.role !== ROLES.FOCUS_COORDINATOR) {
    return (
      <div className={styles.welcomeHeader}>
        <div className={styles.orgName}>{copy.restricted_title}</div>
        <div className={styles.welcomeText}>{copy.restricted_subtitle}</div>
      </div>
    );
  }

  let metricsError: string | null = null;
  let metrics: Awaited<ReturnType<typeof getCohortMetrics>> | null = null;
  try {
    metrics = await getCohortMetrics({ days: 30, until: new Date() });
  } catch (error) {
    metricsError =
      error instanceof Error ? error.message : "Failed to load cohort analytics.";
  }

  const organizations = metrics?.organizations ?? [];
  const avgProgress =
    organizations.length > 0
      ? Math.round(
          organizations.reduce(
            (acc, org) => acc + ((org.currentPhase ?? 1) / TOTAL_PHASES) * 100,
            0,
          ) / organizations.length,
        )
      : 0;
  const activeAlerts = organizations.filter(
    (org) =>
      org.trackedMinutes === 0 ||
      org.completedTasks === 0 ||
      org.gateStatus === "blocked" ||
      org.deliverablesBottleneck !== "none",
  ).length;
  const activeOrganizations30d = organizations.filter(
    (org) => org.trackedMinutes > 0 || org.completedTasks > 0,
  ).length;
  const organizationsWithTrackingSignal = organizations.filter(
    (org) => org.trackedMinutes > 0 && org.completedTasks > 0,
  ).length;
  const trackingCoveragePct =
    organizations.length > 0
      ? Math.round((organizationsWithTrackingSignal / organizations.length) * 100)
      : 0;

  const phaseDistribution = Array.from(
    { length: TOTAL_PHASES },
    (_, index) => index + 1,
  ).map((phase) => ({
    phase,
    count: organizations.filter((org) => org.currentPhase === phase).length,
  }));

  const phaseStatusLabel = (status: string | null) => {
    if (!status) {
      return copy.no_status;
    }
    const labels: Record<string, string> = {
      review_requested: copy.review_requested,
      in_progress: copy.in_progress,
      locked: copy.locked,
      approved: copy.approved,
    };
    return labels[status] ?? status;
  };

  const gateStatusLabel = (status: "ready" | "blocked" | "unknown") => {
    if (status === "ready") {
      return copy.gate_ready;
    }
    if (status === "blocked") {
      return copy.gate_blocked;
    }
    return copy.gate_unknown;
  };

  const deliverablesBottleneckLabel = (bottleneck: string) => {
    const labels: Record<string, string> = {
      awaiting_generation: copy.awaiting_generation,
      blocked_by_outputs: copy.blocked_by_outputs,
      awaiting_review_request: copy.awaiting_review_request,
      awaiting_facilitator: copy.awaiting_facilitator,
      awaiting_publication: copy.awaiting_publication,
      none: copy.no_bottleneck,
    };
    return labels[bottleneck] ?? bottleneck;
  };

  return (
    <>
      <TelemetryTracker
        sectionKey="cohort-dashboard"
        phaseNumber={0}
        enabled={Boolean(session.organizationId)}
      />

      <div className={styles.welcomeHeader}>
        <div className={styles.orgName}>{copy.title}</div>
        <div className={styles.welcomeText}>{copy.subtitle}</div>
      </div>

      <div className={styles.metricsRow} style={{ marginBottom: "var(--space-2xl)" }}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.avg_progress}</div>
          <div className={styles.metricValue}>{avgProgress}%</div>
          <div style={{ marginTop: "var(--space-sm)" }}>
            <div className={styles.progressTrack} style={{ height: 6 }}>
              <div className={styles.progressFill} style={{ width: `${avgProgress}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.total_time_30d}</div>
          <div className={styles.metricValue}>
            {formatHours(metrics?.totals.trackedMinutes ?? 0)}
          </div>
          <div className={styles.metricSub}>
            {metricsError
              ? copy.analytics_unavailable
              : `${metrics?.totals.completedTasks ?? 0} ${copy.tasks_completed}`}
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.active_orgs_30d}</div>
          <div className={styles.metricValue}>{activeOrganizations30d}</div>
          <div className={styles.metricSub}>
            {metricsError
              ? copy.analytics_unavailable
              : `${organizationsWithTrackingSignal}/${organizations.length} ${copy.orgs_with_tracking_signal}`}
          </div>
        </div>
      </div>

      <div className={styles.metricsRow} style={{ marginBottom: "var(--space-2xl)" }}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.active_alerts}</div>
          <div
            className={styles.metricValue}
            style={{ color: activeAlerts > 0 ? "var(--error)" : "var(--primary)" }}
          >
            {activeAlerts}
          </div>
          <div className={styles.metricSub}>{copy.active_alerts_sub}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.phase_distribution}</div>
          <div className={styles.phaseDistRow}>
            {phaseDistribution.map(({ phase, count }) => (
              <div key={phase} className={styles.phaseDistItem} title={`${copy.phase} ${phase}`}>
                <div className={styles.phaseDistLabel}>F{phase}</div>
                <div className={styles.phaseDistCount}>{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.tracking_coverage}</div>
          <div className={styles.metricValue}>{trackingCoveragePct}%</div>
          <div className={styles.metricSub}>{copy.tracking_coverage_sub}</div>
        </div>
      </div>

      <div className={styles.metricsRow} style={{ marginBottom: "var(--space-2xl)" }}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.gate_blocked_orgs}</div>
          <div className={styles.metricValue}>{metrics?.bottlenecks.blockedByGate ?? 0}</div>
          <div className={styles.metricSub}>{copy.gate_blocked_orgs_sub}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.deliverables_pending_handoff}</div>
          <div className={styles.metricValue}>
            {metrics?.bottlenecks.deliverablesPending ?? 0}
          </div>
          <div className={styles.metricSub}>{copy.deliverables_pending_handoff_sub}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{copy.progression_ordering}</div>
          <div className={styles.metricValue}>{copy.progression_ordering_value}</div>
          <div className={styles.metricSub}>{copy.progression_ordering_sub}</div>
        </div>
      </div>

      <div className={styles.cohortTableContainer}>
        <div className={styles.cohortTableHeader}>
          <h3>{copy.organizations}</h3>
        </div>

        <table className={styles.cohortTable}>
          <thead>
            <tr>
              <th>{copy.organization}</th>
              <th>{copy.phase}</th>
              <th>{copy.time_in_phase}</th>
              <th>{copy.time_30d}</th>
              <th>{copy.tasks}</th>
              <th>{copy.current_gate}</th>
              <th>{copy.deliverables}</th>
              <th>{copy.status}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => {
              const isAlert =
                org.trackedMinutes === 0 ||
                org.completedTasks === 0 ||
                org.gateStatus === "blocked" ||
                org.deliverablesBottleneck !== "none";

              return (
                <tr key={org.organizationId}>
                  <td className={styles.orgCell}>
                    <span className={styles.orgNameCell}>{org.organizationName}</span>
                  </td>
                  <td>
                    <span className={`${styles.phaseBadge} ${styles.phaseBadgeActive}`}>
                      {copy.phase} {org.currentPhase ?? 1}
                    </span>
                    <div className={styles.metricSub}>
                      {phaseStatusLabel(org.currentPhaseStatus)}
                    </div>
                  </td>
                  <td>
                    {org.timeInPhaseDays === null
                      ? "-"
                      : `${org.timeInPhaseDays} ${copy.days}`}
                  </td>
                  <td>{formatHours(org.trackedMinutes)}</td>
                  <td>{org.completedTasks}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        org.gateStatus === "blocked"
                          ? styles.statusBadgeAlert
                          : styles.statusBadgeOk
                      }`}
                    >
                      {gateStatusLabel(org.gateStatus)}
                    </span>
                    <div className={styles.metricSub}>
                      {org.gateCompletedOutputs}/{org.gateRequiredOutputs} {copy.outputs}
                      {org.gateMissingOutputs > 0
                        ? ` - ${org.gateMissingOutputs} ${copy.missing}`
                        : ""}
                    </div>
                  </td>
                  <td>
                    <span className={styles.phaseBadge}>
                      {org.deliverablesVersion ? `v${org.deliverablesVersion}` : "-"}
                    </span>
                    <div className={styles.metricSub}>
                      {(org.deliverablesLatestStatus ?? "draft") +
                        " - " +
                        (org.deliverablesReadinessStatus ?? "not_ready")}
                    </div>
                    <div className={styles.metricSub}>
                      {deliverablesBottleneckLabel(org.deliverablesBottleneck)}
                    </div>
                  </td>
                  <td>
                    {isAlert ? (
                      <span className={`${styles.statusBadge} ${styles.statusBadgeAlert}`}>
                        {copy.needs_attention}
                      </span>
                    ) : (
                      <span className={`${styles.statusBadge} ${styles.statusBadgeOk}`}>
                        {copy.on_track}
                      </span>
                    )}
                  </td>
                  <td className={styles.actionsCell}>
                    <Link
                      href={`/${lang}/phases/${org.currentPhase ?? 1}?org=${org.organizationId}`}
                      className={styles.btnTable}
                    >
                      {lang === "es" ? "Abrir workspace" : "Open workspace"}
                    </Link>
                  </td>
                </tr>
              );
            })}

            {organizations.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "var(--space-xl)", color: "var(--outline)" }}>
                  {metricsError ? copy.no_organizations_error : copy.no_organizations_empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className={styles.metricSub} style={{ marginTop: "var(--space-lg)" }}>
        {copy.cohort_focus_footer}
      </p>
    </>
  );
}
