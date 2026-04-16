export function parsePhaseNumber(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

type AccessResult = {
  allowed: boolean;
  currentPhase: number;
  reason?: string;
  missingOutputs?: Array<{ outputKey: string; outputLabel: string }>;
};

type RolePhaseAccessInput = {
  role: string;
  orgAccess: AccessResult;
};

type RolePhaseAccessResult = AccessResult & {
  mode: "execution" | "oversight";
};

export function isOversightRole(role: string) {
  return role === "facilitator" || role === "focus_coordinator";
}

export function resolveRolePhaseAccess(
  input: RolePhaseAccessInput,
): RolePhaseAccessResult {
  if (isOversightRole(input.role)) {
    return {
      allowed: true,
      currentPhase: input.orgAccess.currentPhase,
      reason: input.orgAccess.reason,
      missingOutputs: input.orgAccess.missingOutputs,
      mode: "oversight",
    };
  }

  return {
    ...input.orgAccess,
    mode: "execution",
  };
}

export function getPhaseWorkspacePanels(phaseNumber: number) {
  return {
    showOnboardingPanel: false,
    showDiagnosisPanel: phaseNumber === 2,
    showDraftBuilderPanel: phaseNumber === 4,
    showValidationPanel: phaseNumber === 5,
    showDeliverablesPanel: phaseNumber === 6,
    showCoachPanel: true,
    showExampleLibraryPanel: phaseNumber !== 1,
  };
}
