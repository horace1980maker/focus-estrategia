import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canAccessCohortAnalytics, getCohortMetrics } from "@/lib/analytics";
import type { UserSession } from "@/lib/auth";
import { writeDeniedAccessEvent } from "@/lib/audit";
import {
  DASHBOARD_ANALYTICS_CONTRACTS,
  parseRequestedDashboardContract,
} from "@/lib/role-dashboard-contracts";

function parseDays(raw: string | null): number {
  const value = Number(raw ?? "30");
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }
  return Math.min(180, Math.floor(value));
}

export function canReadCohortAnalytics(session: UserSession): boolean {
  return canAccessCohortAnalytics(session);
}

function toCohortOversightContract(metrics: Awaited<ReturnType<typeof getCohortMetrics>>) {
  return {
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
    totals: metrics.totals,
    benchmark: metrics.benchmark,
    bySection: metrics.bySection,
    organizations: metrics.organizations.map((organization) => ({
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      currentPhase: organization.currentPhase,
      currentPhaseStatus: organization.currentPhaseStatus,
      timeInPhaseDays: organization.timeInPhaseDays,
      gateStatus: organization.gateStatus,
      gateRequiredOutputs: organization.gateRequiredOutputs,
      gateCompletedOutputs: organization.gateCompletedOutputs,
      gateMissingOutputs: organization.gateMissingOutputs,
      trackedMinutes: organization.trackedMinutes,
      completedTasks: organization.completedTasks,
      sessionsCount: organization.sessionsCount,
      roiUsdSaved: organization.roiUsdSaved,
      roiHoursSaved: organization.roiHoursSaved,
      deliverablesLatestStatus: organization.deliverablesLatestStatus,
      deliverablesReadinessStatus: organization.deliverablesReadinessStatus,
      deliverablesVersion: organization.deliverablesVersion,
      deliverablesPendingAction: organization.deliverablesPendingAction,
      deliverablesBottleneck: organization.deliverablesBottleneck,
    })),
    bottlenecks: metrics.bottlenecks,
    dataState: metrics.dataState,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const url = new URL(request.url);
    const requestedContract = parseRequestedDashboardContract(
      url.searchParams.get("contract"),
    );
    if (!canReadCohortAnalytics(session)) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "cohort_analytics",
        reason: "cohort_analytics_forbidden",
      });
      return NextResponse.json(
        { error: "Only focus_coordinator can access cohort analytics." },
        { status: 403 },
      );
    }

    if (
      requestedContract &&
      requestedContract !== DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT
    ) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "cohort_analytics",
        reason: "cohort_analytics_contract_forbidden",
        metadata: {
          requestedContract,
          expectedContract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
        },
      });
      return NextResponse.json(
        {
          error: `Requested contract ${requestedContract} is not allowed for role ${session.role}.`,
          expectedContract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
        },
        { status: 403 },
      );
    }

    const days = parseDays(url.searchParams.get("days"));
    const metrics = await getCohortMetrics({ days, until: new Date() });

    return NextResponse.json({
      contract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
      ...toCohortOversightContract(metrics),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load cohort analytics." },
      { status: 500 },
    );
  }
}
