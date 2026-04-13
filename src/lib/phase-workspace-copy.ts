import type { Locale } from "@/i18n/config";

type WorkspaceStateHintKey =
  | "blocked"
  | "pending_review"
  | "approved"
  | "role_restricted";

export function getPhaseStatusLabel(lang: Locale, status: string) {
  const labels: Record<string, { en: string; es: string }> = {
    locked: { en: "Locked", es: "Bloqueada" },
    in_progress: { en: "In Progress", es: "En progreso" },
    review_requested: { en: "Review Requested", es: "Revision solicitada" },
    approved: { en: "Approved", es: "Aprobada" },
  };
  const entry = labels[status];
  if (!entry) {
    return status;
  }
  return lang === "es" ? entry.es : entry.en;
}

export function getPhaseGateMessage(lang: Locale, missingCount: number) {
  if (missingCount > 0) {
    return lang === "es"
      ? `La fase no puede solicitar revision todavia. Faltan ${missingCount} salidas requeridas.`
      : `This phase cannot request review yet. ${missingCount} required outputs are still missing.`;
  }

  return lang === "es"
    ? "La fase tiene las salidas requeridas completas y puede avanzar a revision."
    : "Required outputs are complete and this phase can move to review.";
}

export function getWorkspaceStateHint(
  lang: Locale,
  key: WorkspaceStateHintKey,
) {
  const hints: Record<WorkspaceStateHintKey, { en: string; es: string }> = {
    blocked: {
      en: "This action is blocked by phase progression rules.",
      es: "Esta accion esta bloqueada por reglas de progresion de fases.",
    },
    pending_review: {
      en: "Review has been requested. Waiting for facilitator decision.",
      es: "La revision fue solicitada. Esperando decision de facilitacion.",
    },
    approved: {
      en: "This phase is approved. Outputs are read-only in this state.",
      es: "Esta fase esta aprobada. Las salidas quedan en modo solo lectura.",
    },
    role_restricted: {
      en: "Your role can view this section, but cannot perform this action.",
      es: "Tu rol puede ver esta seccion, pero no ejecutar esta accion.",
    },
  };

  return lang === "es" ? hints[key].es : hints[key].en;
}
