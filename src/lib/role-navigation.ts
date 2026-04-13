import { ROLES, type Role } from "@/lib/auth";

export type SidebarPrimaryNavKey = "dashboard" | "cohort";
export type SidebarSystemNavKey =
  | "deliverables"
  | "pending_approvals"
  | "cohort"
  | "examples";
export type OrganizationContextOption = {
  id: string;
  name: string;
};

export function getRoleSidebarPrimaryNavKey(role: Role): SidebarPrimaryNavKey {
  return role === ROLES.FOCUS_COORDINATOR ? "cohort" : "dashboard";
}

export function getRoleSidebarSystemNavKeys(input: {
  role: Role;
  deliverablesEnabled: boolean;
}): SidebarSystemNavKey[] {
  const keys: SidebarSystemNavKey[] = [];
  if (input.deliverablesEnabled && input.role !== ROLES.FOCUS_COORDINATOR) {
    keys.push("deliverables");
  }
  if (input.role === ROLES.FACILITATOR) {
    keys.push("pending_approvals");
  }
  if (input.role === ROLES.FOCUS_COORDINATOR) {
    keys.push("cohort");
  }
  keys.push("examples");
  return keys;
}

export function dedupeOrganizationContextOptions(
  options: OrganizationContextOption[],
  _preferredOrganizationId: string | null,
): OrganizationContextOption[] {
  const byId = new Map<string, OrganizationContextOption>();
  for (const option of options) {
    if (!byId.has(option.id)) {
      byId.set(option.id, option);
    }
  }

  const unique = Array.from(byId.values()).sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.id.localeCompare(right.id);
  });

  const duplicateNameCounts = new Map<string, number>();
  for (const option of unique) {
    const key = option.name.trim().toLocaleLowerCase();
    duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
  }

  return unique.map((option) => {
    const key = option.name.trim().toLocaleLowerCase();
    const count = duplicateNameCounts.get(key) ?? 0;
    if (count <= 1) {
      return option;
    }

    return {
      ...option,
      name: `${option.name} (${option.id.slice(0, 8)})`,
    };
  });
}
