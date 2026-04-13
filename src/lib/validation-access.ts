import { hasPermission, type Role } from "./auth";

export type ValidationMutationAccessInput = {
  role: Role;
  sessionOrganizationId: string | null;
  targetOrganizationId: string;
  isLocked: boolean;
};

export type ValidationMutationAccessResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "permission_denied" | "organization_scope_denied" | "validation_locked";
    };

/**
 * Canonical mutation guard for Phase 5 validation operations.
 * This keeps authorization and lock checks in one reusable place.
 */
export function evaluateValidationMutationAccess(
  input: ValidationMutationAccessInput,
): ValidationMutationAccessResult {
  if (!hasPermission(input.role, "canEditOrgData")) {
    return { allowed: false, reason: "permission_denied" };
  }

  if (input.sessionOrganizationId !== input.targetOrganizationId) {
    return { allowed: false, reason: "organization_scope_denied" };
  }

  if (input.isLocked) {
    return { allowed: false, reason: "validation_locked" };
  }

  return { allowed: true };
}

/**
 * Facilitators and officials are always read-only in validation.
 */
export function canEditValidation(role: Role): boolean {
  return role === "ngo_admin";
}

