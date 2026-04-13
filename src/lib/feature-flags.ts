type FeatureFlagName =
  | "phaseWorkspaces"
  | "deliverablesLifecycle";

function parseFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export const featureFlags = {
  phaseWorkspaces: parseFlag(process.env.PHASE_WORKSPACES_ENABLED, true),
  deliverablesLifecycle: parseFlag(process.env.DELIVERABLES_LIFECYCLE_ENABLED, true),
};

export function isFeatureEnabled(name: FeatureFlagName) {
  return featureFlags[name];
}
