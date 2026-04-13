export type PhaseWorkspacePageState =
  | "missing_org"
  | "missing_tracker"
  | "missing_phase"
  | "blocked"
  | "ready";

export function resolvePhaseWorkspacePageState(input: {
  hasOrganizationId: boolean;
  hasPhaseStatus: boolean;
  hasPhase: boolean;
  accessAllowed: boolean;
}): PhaseWorkspacePageState {
  if (!input.hasOrganizationId) {
    return "missing_org";
  }
  if (!input.hasPhaseStatus) {
    return "missing_tracker";
  }
  if (!input.hasPhase) {
    return "missing_phase";
  }
  if (!input.accessAllowed) {
    return "blocked";
  }
  return "ready";
}
