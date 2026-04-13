import type { Locale } from "@/i18n/config";

type PhaseDescriptionMap = Record<number, string>;

const EN_DESCRIPTIONS: PhaseDescriptionMap = {
  1: "Capture organizational profile, participants, commitments, and engagement calendar.",
  2: "Run focused diagnosis including strategic coherence and digital-capacity baseline.",
  3: "Define theory of change, strategic priorities, and outcome architecture.",
  4: "Draft the strategic plan with action lines, milestones, and responsibilities.",
  5: "Facilitator-led validation and final adjustments before release.",
  6: "Prepare final deliverables package, versioning, and export for closure.",
};

const ES_DESCRIPTIONS: PhaseDescriptionMap = {
  1: "Capturar perfil organizacional, participantes, compromisos y calendario de acompañamiento.",
  2: "Ejecutar diagnóstico focalizado incluyendo coherencia estratégica y capacidad digital base.",
  3: "Definir teoría de cambio, prioridades estratégicas y arquitectura de resultados.",
  4: "Construir el borrador del plan con líneas de acción, hitos y responsabilidades.",
  5: "Validación facilitada y ajustes finales antes de la entrega.",
  6: "Preparar paquete final de entregables, versionado y exportación para cierre.",
};

export function getPhaseDescription(phaseNumber: number, lang: Locale): string {
  const source = lang === "es" ? ES_DESCRIPTIONS : EN_DESCRIPTIONS;
  return source[phaseNumber] ?? (lang === "es" ? "Fase en definición." : "Phase details pending.");
}
