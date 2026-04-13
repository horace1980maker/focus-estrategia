// Auth types and role definitions for the Strategic Accompaniment Workspace
// MVP uses a lightweight session-based approach; swap to NextAuth.js for production

export const ROLES = {
  NGO_ADMIN: "ngo_admin",
  FACILITATOR: "facilitator",
  FOCUS_COORDINATOR: "focus_coordinator",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null; // null for facilitators and coordinators
  authSessionId?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
  authMode?: "mock" | "credentials";
}

// Role hierarchy for permission checks
export const ROLE_PERMISSIONS = {
  [ROLES.FOCUS_COORDINATOR]: {
    canViewCohort: true,
    canViewAllOrgs: true,
    canApprovePhases: false,
    canEditOrgData: false,
    canManageUsers: false,
    canSwitchOrganizationContext: true,
    canUpdateRoiBenchmark: false,
  },
  [ROLES.FACILITATOR]: {
    canViewCohort: true,
    canViewAllOrgs: true,
    canApprovePhases: true,
    canEditOrgData: false,
    canManageUsers: true,
    canSwitchOrganizationContext: true,
    canUpdateRoiBenchmark: true,
  },
  [ROLES.NGO_ADMIN]: {
    canViewCohort: false,
    canViewAllOrgs: false,
    canApprovePhases: false,
    canEditOrgData: true,
    canManageUsers: true,
    canSwitchOrganizationContext: false,
    canUpdateRoiBenchmark: true,
  },
} as const;

export type Permission = keyof (typeof ROLE_PERMISSIONS)[Role];

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Cohort dashboard requires focus coordinator
  if (pathname.includes("/cohort")) {
    return role === ROLES.FOCUS_COORDINATOR;
  }
  // Admin routes
  if (pathname.includes("/admin")) {
    return role === ROLES.FOCUS_COORDINATOR;
  }
  // All roles can access org-specific and general routes
  return true;
}
