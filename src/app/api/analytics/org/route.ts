import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrganizationMetrics } from "@/lib/analytics";
import { ROLES, type UserSession } from "@/lib/auth";
import { writeDeniedAccessEvent } from "@/lib/audit";
import {
  DASHBOARD_ANALYTICS_CONTRACTS,
  parseRequestedDashboardContract,
  validateRequestedDashboardContract,
} from "@/lib/role-dashboard-contracts";

function parseDays(raw: string | null): number {
  const value = Number(raw ?? "30");
  if (!Number.isFinite(value) || value <= 0) {
    return 30;
  }
  return Math.min(180, Math.floor(value));
}

export function resolveOrganizationAnalyticsScope(
  session: UserSession,
  requestedOrgId: string | null,
): { organizationId: string | null; error?: string; status?: 400 | 403 } {
  const canViewAllOrganizations =
    session.role === ROLES.FOCUS_COORDINATOR || session.role === ROLES.FACILITATOR;
  const organizationId = requestedOrgId ?? session.organizationId;

  if (!organizationId) {
    return { organizationId: null, error: "No organization selected for metrics.", status: 400 };
  }

  if (!canViewAllOrganizations && session.organizationId !== organizationId) {
    return { organizationId: null, error: "Not authorized for this organization.", status: 403 };
  }

  return { organizationId };
}

function toOversightOrgContract(metrics: Awaited<ReturnType<typeof getOrganizationMetrics>>) {
  return {
    organizationId: metrics.organizationId,
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
    totals: metrics.totals,
    roi: {
      hourlyRateUsd: metrics.roi.hourlyRateUsd,
      platformHours: metrics.roi.platformHours,
      manualHoursEstimate: metrics.roi.manualHoursEstimate,
      hoursSaved: metrics.roi.hoursSaved,
      usdSaved: metrics.roi.usdSaved,
    },
    phase: metrics.phase,
    deliverables: {
      latestVersionNumber: metrics.deliverables.latestVersionNumber,
      latestStatus: metrics.deliverables.latestStatus,
      readinessStatus: metrics.deliverables.readinessStatus,
      pendingAction: metrics.deliverables.pendingAction,
      bottleneck: metrics.deliverables.bottleneck,
    },
    projection: metrics.projection,
    dataState: metrics.dataState,
  };
}

function toNgoExecutionContract(metrics: Awaited<ReturnType<typeof getOrganizationMetrics>>) {
  return {
    organizationId: metrics.organizationId,
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
    totals: metrics.totals,
    bySection: metrics.bySection,
    byPhase: metrics.byPhase,
    trends: metrics.trends,
    roi: metrics.roi,
    phase: metrics.phase,
    deliverables: metrics.deliverables,
    projection: metrics.projection,
    dataState: metrics.dataState,
  };
}

function toFacilitatorFollowupContract(
  metrics: Awaited<ReturnType<typeof getOrganizationMetrics>>,
) {
  return {
    organizationId: metrics.organizationId,
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
    totals: metrics.totals,
    bySection: metrics.bySection,
    trends: metrics.trends,
    roi: {
      hourlyRateUsd: metrics.roi.hourlyRateUsd,
      platformHours: metrics.roi.platformHours,
      manualHoursEstimate: metrics.roi.manualHoursEstimate,
      hoursSaved: metrics.roi.hoursSaved,
      usdSaved: metrics.roi.usdSaved,
    },
    phase: metrics.phase,
    deliverables: {
      latestVersionNumber: metrics.deliverables.latestVersionNumber,
      latestStatus: metrics.deliverables.latestStatus,
      readinessStatus: metrics.deliverables.readinessStatus,
      pendingAction: metrics.deliverables.pendingAction,
      bottleneck: metrics.deliverables.bottleneck,
    },
    followUp: {
      pendingReview: metrics.phase.currentPhaseStatus === "review_requested",
      gateStatus: metrics.phase.gateStatus,
    },
    projection: metrics.projection,
    dataState: metrics.dataState,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const url = new URL(request.url);
    const days = parseDays(url.searchParams.get("days"));
    const requestedOrgId = url.searchParams.get("organizationId");
    const requestedContract = parseRequestedDashboardContract(
      url.searchParams.get("contract"),
    );
    const scope = resolveOrganizationAnalyticsScope(session, requestedOrgId);
    const contractValidation = validateRequestedDashboardContract({
      role: session.role,
      requestedContract,
    });

    if (scope.error && scope.status) {
      await writeDeniedAccessEvent({
        session,
        organizationId: requestedOrgId,
        targetEntityType: "organization_analytics",
        reason: "organization_analytics_scope_forbidden",
      });
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    if (!contractValidation.ok) {
      await writeDeniedAccessEvent({
        session,
        organizationId: requestedOrgId,
        targetEntityType: "organization_analytics",
        reason: "organization_analytics_contract_forbidden",
        metadata: {
          requestedContract,
          expectedContract: contractValidation.expectedContract,
        },
      });
      return NextResponse.json(
        {
          error: contractValidation.error,
          expectedContract: contractValidation.expectedContract,
        },
        { status: 403 },
      );
    }

    const organizationId = scope.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "No organization selected for metrics." },
        { status: 400 },
      );
    }

    const metrics = await getOrganizationMetrics({
      organizationId,
      days,
      until: new Date(),
    });

    if (
      contractValidation.expectedContract ===
      DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT
    ) {
      return NextResponse.json({
        contract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
        ...toOversightOrgContract(metrics),
      });
    }
    if (
      contractValidation.expectedContract ===
      DASHBOARD_ANALYTICS_CONTRACTS.FACILITATOR_REVIEW
    ) {
      return NextResponse.json({
        contract: DASHBOARD_ANALYTICS_CONTRACTS.FACILITATOR_REVIEW,
        ...toFacilitatorFollowupContract(metrics),
      });
    }

    return NextResponse.json({
      contract: DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION,
      ...toNgoExecutionContract(metrics),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load organization metrics." },
      { status: 500 },
    );
  }
}
