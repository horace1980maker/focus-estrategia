import type { Locale } from "@/i18n/config";

export type ExampleLibraryItem = {
  id: string;
  phases: number[];
  title: string;
  description: string;
  template: string;
  tags: string[];
};

type LocalizedText = {
  en: string;
  es: string;
};

type ExampleSeed = {
  id: string;
  phases: number[];
  title: LocalizedText;
  description: LocalizedText;
  template: LocalizedText;
  tags: string[];
};

const EXAMPLE_SEEDS: ExampleSeed[] = [
  {
    id: "phase-1-kickoff-charter",
    phases: [1],
    title: {
      es: "Acta de arranque y alineacion",
      en: "Kickoff and alignment charter",
    },
    description: {
      es: "Plantilla para acordar participantes, compromisos y calendario de acompanamiento.",
      en: "Template to align participants, commitments, and accompaniment cadence.",
    },
    template: {
      es: "Objetivo de la fase\n- Resultado esperado:\n\nParticipantes clave\n- Internos:\n- Externos:\n\nCompromisos\n- Compromiso 1:\n- Compromiso 2:\n\nCalendario\n- Sesion 1:\n- Sesion 2:\n",
      en: "Phase objective\n- Expected outcome:\n\nKey participants\n- Internal:\n- External:\n\nCommitments\n- Commitment 1:\n- Commitment 2:\n\nCalendar\n- Session 1:\n- Session 2:\n",
    },
    tags: ["kickoff", "alignment", "governance"],
  },
  {
    id: "phase-2-diagnosis-synthesis",
    phases: [2],
    title: {
      es: "Sintesis de diagnostico focalizado",
      en: "Focused diagnosis synthesis",
    },
    description: {
      es: "Estructura para resumir hallazgos, barreras y oportunidades prioritarias.",
      en: "Structure to summarize findings, barriers, and priority opportunities.",
    },
    template: {
      es: "Hallazgos principales\n- Fortaleza:\n- Brecha:\n\nBarreras criticas\n- Barrera 1:\n- Impacto:\n\nPrioridades inmediatas\n- Prioridad 1:\n- Prioridad 2:\n",
      en: "Main findings\n- Strength:\n- Gap:\n\nCritical barriers\n- Barrier 1:\n- Impact:\n\nImmediate priorities\n- Priority 1:\n- Priority 2:\n",
    },
    tags: ["diagnosis", "baseline", "analysis"],
  },
  {
    id: "phase-3-theory-of-change-canvas",
    phases: [3],
    title: {
      es: "Canvas de teoria de cambio",
      en: "Theory of change canvas",
    },
    description: {
      es: "Patron para conectar problema, resultados y supuestos estrategicos.",
      en: "Pattern to connect problem, outcomes, and strategic assumptions.",
    },
    template: {
      es: "Problema estrategico\n- Definicion:\n\nResultado de impacto\n- A largo plazo:\n\nResultados intermedios\n- Resultado 1:\n- Resultado 2:\n\nSupuestos criticos\n- Supuesto 1:\n- Riesgo asociado:\n",
      en: "Strategic problem\n- Definition:\n\nImpact outcome\n- Long-term:\n\nIntermediate outcomes\n- Outcome 1:\n- Outcome 2:\n\nCritical assumptions\n- Assumption 1:\n- Related risk:\n",
    },
    tags: ["theory-of-change", "outcomes", "strategy"],
  },
  {
    id: "phase-4-implementation-roadmap",
    phases: [4],
    title: {
      es: "Hoja de ruta de implementacion",
      en: "Implementation roadmap",
    },
    description: {
      es: "Formato para traducir prioridades en lineas de accion y responsables.",
      en: "Format to translate priorities into action lines and ownership.",
    },
    template: {
      es: "Objetivo estrategico\n- Objetivo:\n\nLinea de accion\n- Actividad:\n- Responsable:\n- Fecha objetivo:\n- Indicador:\n\nDependencias\n- Dependencia clave:\n",
      en: "Strategic objective\n- Objective:\n\nAction line\n- Activity:\n- Owner:\n- Target date:\n- Indicator:\n\nDependencies\n- Key dependency:\n",
    },
    tags: ["roadmap", "execution", "planning"],
  },
  {
    id: "phase-5-validation-checklist",
    phases: [5],
    title: {
      es: "Checklist de validacion facilitada",
      en: "Facilitated validation checklist",
    },
    description: {
      es: "Guia para validar consistencia, evidencia y ajustes finales del borrador.",
      en: "Guide to validate consistency, evidence, and final draft adjustments.",
    },
    template: {
      es: "Criterios de validacion\n- Coherencia interna:\n- Viabilidad:\n- Evidencia:\n\nAjustes acordados\n- Ajuste 1:\n- Responsable:\n\nDecision de avance\n- Estado:\n- Condiciones:\n",
      en: "Validation criteria\n- Internal coherence:\n- Feasibility:\n- Evidence:\n\nAgreed adjustments\n- Adjustment 1:\n- Owner:\n\nProgression decision\n- Status:\n- Conditions:\n",
    },
    tags: ["validation", "review", "quality"],
  },
  {
    id: "phase-6-deliverables-handoff",
    phases: [6],
    title: {
      es: "Checklist de handoff de entregables",
      en: "Deliverables handoff checklist",
    },
    description: {
      es: "Plantilla para asegurar versionado, aprobacion y publicacion de entregables.",
      en: "Template to secure versioning, approval, and publication readiness.",
    },
    template: {
      es: "Version actual\n- Numero de version:\n- Estado:\n\nChecklist de handoff\n- Evidencia consolidada:\n- Aprobacion facilitador:\n- Validacion final ONG:\n\nExportaciones requeridas\n- PDF:\n- DOCX:\n",
      en: "Current version\n- Version number:\n- Status:\n\nHandoff checklist\n- Consolidated evidence:\n- Facilitator approval:\n- Final NGO validation:\n\nRequired exports\n- PDF:\n- DOCX:\n",
    },
    tags: ["deliverables", "handoff", "publication"],
  },
  {
    id: "cross-phase-commitment-radar",
    phases: [1, 2, 3, 4, 5, 6],
    title: {
      es: "Radar de compromiso del equipo",
      en: "Team commitment radar",
    },
    description: {
      es: "Marco transversal para registrar acuerdos, bloqueos y seguimiento de compromiso.",
      en: "Cross-phase framework to track agreements, blockers, and commitment follow-up.",
    },
    template: {
      es: "Acuerdos de compromiso\n- Acuerdo 1:\n\nRiesgos de cumplimiento\n- Riesgo:\n- Senal temprana:\n\nPlan de soporte\n- Soporte requerido:\n- Responsable de seguimiento:\n",
      en: "Commitment agreements\n- Agreement 1:\n\nCompliance risks\n- Risk:\n- Early signal:\n\nSupport plan\n- Support needed:\n- Follow-up owner:\n",
    },
    tags: ["commitment", "monitoring", "cross-phase"],
  },
];

function localize(value: LocalizedText, lang: Locale) {
  return lang === "es" ? value.es : value.en;
}

export function getAllExampleLibraryItems(lang: Locale): ExampleLibraryItem[] {
  return EXAMPLE_SEEDS.map((seed) => ({
    id: seed.id,
    phases: seed.phases,
    title: localize(seed.title, lang),
    description: localize(seed.description, lang),
    template: localize(seed.template, lang),
    tags: seed.tags,
  }));
}

export function getExamplesForPhase(
  phaseNumber: number,
  lang: Locale,
): ExampleLibraryItem[] {
  const items = getAllExampleLibraryItems(lang);
  return items.sort((a, b) => {
    const aExact = a.phases.includes(phaseNumber) ? 1 : 0;
    const bExact = b.phases.includes(phaseNumber) ? 1 : 0;
    if (aExact !== bExact) {
      return bExact - aExact;
    }
    if (a.phases.length !== b.phases.length) {
      return a.phases.length - b.phases.length;
    }
    return a.title.localeCompare(b.title);
  });
}

export function getExampleById(
  id: string,
  lang: Locale,
): ExampleLibraryItem | null {
  const item = getAllExampleLibraryItems(lang).find((entry) => entry.id === id);
  return item ?? null;
}
