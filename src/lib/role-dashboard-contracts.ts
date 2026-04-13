import type { Locale } from "@/i18n/config";
import { ROLES, type Role } from "@/lib/auth";

export const DASHBOARD_ANALYTICS_CONTRACTS = {
  NGO_EXECUTION: "ngo_execution",
  FACILITATOR_REVIEW: "facilitator_review",
  OFFICIAL_OVERSIGHT: "official_oversight",
} as const;

export type DashboardAnalyticsContract =
  (typeof DASHBOARD_ANALYTICS_CONTRACTS)[keyof typeof DASHBOARD_ANALYTICS_CONTRACTS];

export type WorkspaceIntent = "organizations" | "facilitator" | "officials";
export type DashboardSurface = "ngo_execution" | "facilitator_review" | "official_oversight";

export const LANDING_WORKSPACE_ENTRY_ORDER: WorkspaceIntent[] = [
  "organizations",
  "facilitator",
  "officials",
];

export type RoleViewContract = {
  role: Role;
  workspaceIntent: WorkspaceIntent;
  dashboardSurface: DashboardSurface;
  dashboardPath: string;
  analyticsContract: DashboardAnalyticsContract;
  canOpenCohort: boolean;
  canReviewQueue: boolean;
  canAdministerOrganizations: boolean;
};

const ROLE_VIEW_CONTRACTS: Record<Role, RoleViewContract> = {
  [ROLES.NGO_ADMIN]: {
    role: ROLES.NGO_ADMIN,
    workspaceIntent: "organizations",
    dashboardSurface: "ngo_execution",
    dashboardPath: "/dashboard",
    analyticsContract: DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION,
    canOpenCohort: false,
    canReviewQueue: false,
    canAdministerOrganizations: false,
  },
  [ROLES.FACILITATOR]: {
    role: ROLES.FACILITATOR,
    workspaceIntent: "facilitator",
    dashboardSurface: "facilitator_review",
    dashboardPath: "/dashboard?queue=pending",
    analyticsContract: DASHBOARD_ANALYTICS_CONTRACTS.FACILITATOR_REVIEW,
    canOpenCohort: false,
    canReviewQueue: true,
    canAdministerOrganizations: true,
  },
  [ROLES.FOCUS_COORDINATOR]: {
    role: ROLES.FOCUS_COORDINATOR,
    workspaceIntent: "officials",
    dashboardSurface: "official_oversight",
    dashboardPath: "/cohort",
    analyticsContract: DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT,
    canOpenCohort: true,
    canReviewQueue: false,
    canAdministerOrganizations: false,
  },
};

export function getRoleViewContract(role: Role): RoleViewContract {
  return ROLE_VIEW_CONTRACTS[role];
}

export function getRoleDashboardPath(role: Role, locale: Locale): string {
  return `/${locale}${getRoleViewContract(role).dashboardPath}`;
}

export function getWorkspaceIntentPath(intent: WorkspaceIntent, locale: Locale): string {
  return `/${locale}/workspace/${intent}`;
}

export function getRoleWorkspaceIntentPath(role: Role, locale: Locale): string {
  return getWorkspaceIntentPath(getRoleViewContract(role).workspaceIntent, locale);
}

export function parseRequestedDashboardContract(
  value: string | null | undefined,
): DashboardAnalyticsContract | null {
  if (!value) {
    return null;
  }
  if (
    value === DASHBOARD_ANALYTICS_CONTRACTS.NGO_EXECUTION ||
    value === DASHBOARD_ANALYTICS_CONTRACTS.FACILITATOR_REVIEW ||
    value === DASHBOARD_ANALYTICS_CONTRACTS.OFFICIAL_OVERSIGHT
  ) {
    return value;
  }
  return null;
}

export function validateRequestedDashboardContract(input: {
  role: Role;
  requestedContract: DashboardAnalyticsContract | null;
}) {
  const expected = getRoleViewContract(input.role).analyticsContract;
  if (input.requestedContract === null) {
    return { ok: true as const, expectedContract: expected };
  }
  if (input.requestedContract !== expected) {
    return {
      ok: false as const,
      expectedContract: expected,
      error: `Requested contract ${input.requestedContract} is not allowed for role ${input.role}.`,
    };
  }
  return { ok: true as const, expectedContract: expected };
}
