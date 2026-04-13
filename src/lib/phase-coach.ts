import type { Locale } from "@/i18n/config";

type CoachRoleMode = "execution" | "review";

export type CoachSuggestion = {
  summary: string;
  nextSteps: Array<{
    label: string;
    href: string;
  }>;
};

function getRoleMode(role: string): CoachRoleMode {
  return role === "facilitator" || role === "focus_coordinator"
    ? "review"
    : "execution";
}

function starterCopy(
  lang: Locale,
  execution: string,
  review: string,
  mode: CoachRoleMode,
) {
  return mode === "execution"
    ? execution
    : review;
}

export function getCoachPromptStarters(input: {
  lang: Locale;
  phaseNumber: number;
  role: string;
}) {
  const mode = getRoleMode(input.role);
  const startersByPhase: Record<number, { en: string[]; es: string[] }> = {
    1: {
      en: [
        starterCopy(input.lang, "What should we align first?", "What should I verify first?", mode),
        starterCopy(input.lang, "How do we de-risk kickoff?", "Where are kickoff risks?", mode),
      ],
      es: [
        starterCopy(input.lang, "Que debemos alinear primero?", "Que debo revisar primero?", mode),
        starterCopy(input.lang, "Como reducimos riesgos de arranque?", "Donde estan los riesgos de arranque?", mode),
      ],
    },
    2: {
      en: [
        starterCopy(input.lang, "Which barriers matter most?", "Which findings need evidence?", mode),
        starterCopy(input.lang, "How do we prioritize diagnosis actions?", "What should I challenge in diagnosis?", mode),
      ],
      es: [
        starterCopy(input.lang, "Que barreras importan mas?", "Que hallazgos requieren evidencia?", mode),
        starterCopy(input.lang, "Como priorizamos acciones de diagnostico?", "Que debo cuestionar del diagnostico?", mode),
      ],
    },
    3: {
      en: [
        starterCopy(input.lang, "How do we sharpen our theory of change?", "Where is logic weak in the theory?", mode),
        starterCopy(input.lang, "What outcomes should come first?", "Which assumptions need validation?", mode),
      ],
      es: [
        starterCopy(input.lang, "Como afinamos la teoria de cambio?", "Donde se debilita la logica?", mode),
        starterCopy(input.lang, "Que resultados van primero?", "Que supuestos hay que validar?", mode),
      ],
    },
    4: {
      en: [
        starterCopy(input.lang, "How do we turn priorities into actions?", "Where is execution ownership unclear?", mode),
        starterCopy(input.lang, "What can we deliver in the next 90 days?", "What milestones look unrealistic?", mode),
      ],
      es: [
        starterCopy(input.lang, "Como convertimos prioridades en acciones?", "Donde no hay responsables claros?", mode),
        starterCopy(input.lang, "Que podemos entregar en 90 dias?", "Que hitos se ven irreales?", mode),
      ],
    },
    5: {
      en: [
        starterCopy(input.lang, "What must be fixed before approval?", "What is still missing for approval?", mode),
        starterCopy(input.lang, "How do we prepare the validation session?", "What feedback should I leave?", mode),
      ],
      es: [
        starterCopy(input.lang, "Que debemos corregir antes de aprobar?", "Que falta para la aprobacion?", mode),
        starterCopy(input.lang, "Como preparar la sesion de validacion?", "Que retroalimentacion debo dejar?", mode),
      ],
    },
    6: {
      en: [
        starterCopy(input.lang, "How do we finalize deliverables?", "What blocks publication readiness?", mode),
        starterCopy(input.lang, "What should we export first?", "What quality checks remain?", mode),
      ],
      es: [
        starterCopy(input.lang, "Como cerramos los entregables?", "Que bloquea la publicacion?", mode),
        starterCopy(input.lang, "Que exportamos primero?", "Que controles de calidad faltan?", mode),
      ],
    },
  };

  const fallback = {
    en: ["What is the next best step?", "Where should we focus now?"],
    es: ["Cual es el siguiente mejor paso?", "Donde debemos enfocarnos ahora?"],
  };

  const local = startersByPhase[input.phaseNumber] ?? fallback;
  return input.lang === "es" ? local.es : local.en;
}

export function buildCoachSuggestion(input: {
  lang: Locale;
  phaseNumber: number;
  role: string;
  prompt: string;
}): CoachSuggestion {
  const mode = getRoleMode(input.role);
  const phaseHref = `/${input.lang}/phases/${input.phaseNumber}`;
  const examplesHref = `/${input.lang}/examples?phase=${input.phaseNumber}`;

  const summary =
    input.lang === "es"
      ? mode === "execution"
        ? "Prioriza una mejora concreta en esta fase, registra evidencia y solicita revision cuando completes salidas requeridas."
        : "Revisa primero brechas de evidencia y define retroalimentacion accionable antes de aprobar."
      : mode === "execution"
        ? "Prioritize one concrete improvement for this phase, attach evidence, and request review once required outputs are complete."
        : "Review evidence gaps first and provide actionable feedback before approving.";

  const nextSteps =
    input.lang === "es"
      ? [
          {
            label:
              mode === "execution"
                ? "Aplicar un patron desde Biblioteca de Ejemplos"
                : "Abrir ejemplos relevantes para revisar calidad",
            href: examplesHref,
          },
          {
            label:
              mode === "execution"
                ? "Completar salidas requeridas de esta fase"
                : "Ir a controles de aprobacion de esta fase",
            href: `${phaseHref}#phase-controls`,
          },
          {
            label:
              mode === "execution"
                ? "Revisar estado y solicitar revision"
                : "Ver cola de pendientes del facilitador",
            href:
              mode === "execution"
                ? `${phaseHref}#phase-status`
                : `/${input.lang}/dashboard?queue=pending`,
          },
        ]
      : [
          {
            label:
              mode === "execution"
                ? "Apply a pattern from the Example Library"
                : "Open relevant examples to review quality",
            href: examplesHref,
          },
          {
            label:
              mode === "execution"
                ? "Complete required outputs for this phase"
                : "Go to approval controls for this phase",
            href: `${phaseHref}#phase-controls`,
          },
          {
            label:
              mode === "execution"
                ? "Review status and request review"
                : "Open facilitator pending queue",
            href:
              mode === "execution"
                ? `${phaseHref}#phase-status`
                : `/${input.lang}/dashboard?queue=pending`,
          },
        ];

  const promptText = input.prompt.trim();
  if (promptText.length > 0) {
    return {
      summary: `${summary} ${input.lang === "es" ? "Enfoque actual:" : "Current focus:"} ${promptText}`,
      nextSteps,
    };
  }

  return { summary, nextSteps };
}
