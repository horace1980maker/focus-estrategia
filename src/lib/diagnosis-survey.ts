import { prisma } from "./prisma";
import { syncDiagnosisToGoogleSheets } from "./google-sheets-sync";

const ACTIVE_SURVEY_VERSION = "focused-diagnosis-v2-full-guide";

const DIGITAL_QUESTION_KEYS = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;
const OPEN_QUESTION_KEY = "C5";

const SURVEY_SECTIONS = [
  { sectionKey: "A", title: "Conocimiento sobre planificacion estrategica", orderIndex: 1 },
  { sectionKey: "B", title: "Aplicacion y uso real de la planificacion estrategica", orderIndex: 2 },
  { sectionKey: "C", title: "Capacidad digital basica para la ejecucion estrategica", orderIndex: 3 },
  { sectionKey: "D", title: "Preguntas complementarias", orderIndex: 4 },
] as const;

type SurveyOption = {
  value: string;
  label: string;
};

type SurveyQuestionType = "likert_1_5" | "open_text" | "single_select" | "multi_select";

type SurveyQuestionSeed = {
  sectionKey: (typeof SURVEY_SECTIONS)[number]["sectionKey"];
  questionKey: string;
  prompt: string;
  questionType: SurveyQuestionType;
  orderIndex: number;
  isRequired?: boolean;
  allowsNoInformation?: boolean;
  scaleMin?: number | null;
  scaleMax?: number | null;
  options?: SurveyOption[];
  exclusiveOptions?: string[];
};

type ParsedQuestionMetadata = {
  options?: SurveyOption[];
  exclusiveOptions?: string[];
  scale?: "A" | "B";
};

type LikertPrompt = {
  key: string;
  prompt: string;
};

const SECTION_A_PROMPTS: LikertPrompt[] = [
  {
    key: "A1",
    prompt:
      "Sabemos como organizar un proceso de planificacion estrategica: quien participa, que decisiones se toman, que productos salen y en que tiempos.",
  },
  {
    key: "A2",
    prompt:
      "Sabemos redactar o actualizar una mision y una vision claras que sirvan para orientar decisiones reales.",
  },
  {
    key: "A3",
    prompt:
      "Sabemos definir pocas prioridades estrategicas y convertirlas en objetivos claros y medibles.",
  },
  {
    key: "A4",
    prompt: "Sabemos elegir indicadores utiles para dar seguimiento a los objetivos estrategicos.",
  },
  {
    key: "A5",
    prompt:
      "Sabemos identificar a las personas y grupos clave que deberian participar en la construccion o revision de la estrategia.",
  },
  {
    key: "A6",
    prompt: "Sabemos definir con claridad quien decide que dentro del proceso estrategico.",
  },
  {
    key: "A7",
    prompt:
      "Sabemos como vincular el presupuesto, el tiempo del equipo y otros recursos con las prioridades estrategicas.",
  },
  {
    key: "A8",
    prompt: "Sabemos como revisar periodicamente la estrategia usando informacion y evidencias.",
  },
  {
    key: "A9",
    prompt:
      "Sabemos como analizar cambios del entorno, riesgos y oportunidades para ajustar la estrategia cuando sea necesario.",
  },
  {
    key: "A10",
    prompt:
      "Sabemos como convertir la estrategia en planes de accion concretos con responsables, tiempos y seguimiento.",
  },
];

const SECTION_B_PROMPTS: LikertPrompt[] = [
  {
    key: "B1",
    prompt: "La organizacion sigue un proceso o calendario de planificacion estrategica de forma regular.",
  },
  {
    key: "B2",
    prompt: "La mision y la vision estan vigentes y realmente se usan para orientar decisiones y prioridades.",
  },
  {
    key: "B3",
    prompt: "Las prioridades y los objetivos estrategicos estan claros y son conocidos por las personas clave.",
  },
  {
    key: "B4",
    prompt: "La organizacion usa indicadores o algun sistema de seguimiento para revisar sus avances estrategicos.",
  },
  {
    key: "B5",
    prompt:
      "Las personas o equipos responsables de la estrategia tienen roles y responsabilidades claramente definidos.",
  },
  {
    key: "B6",
    prompt: "El presupuesto, el tiempo y otros recursos se ajustan de acuerdo con las prioridades estrategicas.",
  },
  {
    key: "B7",
    prompt:
      "La organizacion realiza revisiones periodicas de su estrategia y de esas revisiones salen decisiones o ajustes concretos.",
  },
  {
    key: "B8",
    prompt: "Existen herramientas o formatos simples para organizar, seguir y revisar la estrategia.",
  },
  {
    key: "B9",
    prompt:
      "La organizacion toma en cuenta cambios del entorno, riesgos y oportunidades al revisar su estrategia.",
  },
  {
    key: "B10",
    prompt:
      "Los planes, proyectos o iniciativas de la organizacion estan conectados con sus objetivos estrategicos.",
  },
];

const SECTION_C_PROMPTS: LikertPrompt[] = [
  {
    key: "D1",
    prompt:
      "Las personas de la organizacion cuentan con dispositivos, conectividad y apoyo tecnico basico para realizar su trabajo de manera adecuada.",
  },
  {
    key: "D2",
    prompt:
      "La organizacion puede encontrar, organizar, guardar y recuperar informacion digital necesaria para el trabajo y la toma de decisiones.",
  },
  {
    key: "D3",
    prompt:
      "El equipo usa herramientas digitales para comunicarse, compartir informacion y colaborar de manera efectiva.",
  },
  {
    key: "D4",
    prompt:
      "La organizacion usa herramientas digitales simples para planificar actividades, dar seguimiento al trabajo y mantener registros basicos de avances.",
  },
  {
    key: "D5",
    prompt:
      "Cuando cambia una herramienta o proceso digital, el equipo suele adaptarse y aprenderlo sin grandes interrupciones.",
  },
  {
    key: "D6",
    prompt:
      "La organizacion aplica practicas basicas de uso seguro digital, como contrasenas, actualizaciones, respaldos y proteccion de informacion sensible.",
  },
];

function createLikertSeeds(
  sectionKey: (typeof SURVEY_SECTIONS)[number]["sectionKey"],
  prompts: LikertPrompt[],
  startOrderIndex: number,
): SurveyQuestionSeed[] {
  return prompts.map((entry, index) => ({
    sectionKey,
    questionKey: entry.key,
    prompt: entry.prompt,
    questionType: "likert_1_5",
    orderIndex: startOrderIndex + index,
    allowsNoInformation: true,
    scaleMin: 1,
    scaleMax: 5,
  }));
}

const SURVEY_QUESTION_SEEDS: SurveyQuestionSeed[] = [
  ...createLikertSeeds("A", SECTION_A_PROMPTS, 101),
  ...createLikertSeeds("B", SECTION_B_PROMPTS, 201),
  ...createLikertSeeds("C", SECTION_C_PROMPTS, 301),
  {
    sectionKey: "D",
    questionKey: "C1",
    prompt: "Cual de estas opciones describe mejor el estado actual del plan estrategico de la organizacion?",
    questionType: "single_select",
    orderIndex: 401,
    isRequired: true,
    options: [
      { value: "no_plan_or_outdated_3y", label: "No existe o esta desactualizado hace mas de 3 años" },
      { value: "updated_2_to_3y", label: "Existe, pero fue actualizado hace entre 2 y 3 años" },
      { value: "updated_12_to_24m", label: "Existe y fue actualizado hace entre 12 y 24 meses" },
      { value: "updated_last_12m", label: "Existe y fue actualizado en los ultimos 12 meses" },
      { value: "no_information", label: "No se / No tengo informacion suficiente" },
    ],
  },
  {
    sectionKey: "D",
    questionKey: "C2",
    prompt: "Que evidencias existen hoy y se usan dentro de la organizacion?",
    questionType: "multi_select",
    orderIndex: 402,
    isRequired: true,
    options: [
      { value: "strategic_plan_documented", label: "Plan estrategico escrito" },
      { value: "mission_vision_values", label: "Mision, vision y valores claramente formulados" },
      { value: "strategic_priorities_defined", label: "Prioridades u objetivos estrategicos definidos" },
      { value: "strategic_indicators_targets", label: "Indicadores estrategicos con metas" },
      { value: "dashboard_or_tracking_format", label: "Algun tablero, cuadro o formato de seguimiento" },
      { value: "strategic_actions_list", label: "Lista de iniciativas o acciones estrategicas" },
      { value: "strategic_review_calendar", label: "Calendario de revision estrategica" },
      { value: "strategy_owner_assigned", label: "Persona o equipo responsable de coordinar la estrategia" },
      { value: "none_of_above", label: "Ninguna de las anteriores" },
      { value: "no_information", label: "No se / No tengo informacion suficiente" },
    ],
    exclusiveOptions: ["none_of_above", "no_information"],
  },
  {
    sectionKey: "D",
    questionKey: "C3",
    prompt:
      "Cual es hoy la principal barrera para usar la planificacion estrategica en las decisiones del dia a dia?",
    questionType: "open_text",
    orderIndex: 403,
    isRequired: true,
  },
  {
    sectionKey: "D",
    questionKey: "C4",
    prompt:
      "Si la organizacion pudiera mejorar una sola cosa en los proximos 6 meses para fortalecer su planificacion estrategica, que deberia mejorar primero?",
    questionType: "open_text",
    orderIndex: 404,
    isRequired: true,
  },
  {
    sectionKey: "D",
    questionKey: OPEN_QUESTION_KEY,
    prompt: "Cual es hoy la principal barrera digital que limita la coordinacion, el seguimiento o la ejecucion del trabajo?",
    questionType: "open_text",
    orderIndex: 405,
    isRequired: true,
  },
];

export type DiagnosisAnswerInput =
  | { numericValue: number }
  | { optionValue: string; isNoInformation?: boolean }
  | { optionValues: string[] }
  | { textValue: string };

type QuestionDefinition = {
  id: string;
  questionKey: string;
  prompt: string;
  questionType: string;
  interpretationNote: string | null;
  isRequired: boolean;
  scaleMin: number | null;
  scaleMax: number | null;
  allowsNoInformation: boolean;
  section: {
    sectionKey: string;
    title: string;
  } | null;
};

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getQuestionMetadata(question: SurveyQuestionSeed): ParsedQuestionMetadata | null {
  const metadata: ParsedQuestionMetadata = {};
  if (question.questionType === "likert_1_5") {
    metadata.scale = question.sectionKey === "A" ? "A" : "B";
  }
  if (question.options && question.options.length > 0) {
    metadata.options = question.options;
  }
  if (question.exclusiveOptions && question.exclusiveOptions.length > 0) {
    metadata.exclusiveOptions = question.exclusiveOptions;
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function parseQuestionMetadata(raw: string | null): ParsedQuestionMetadata {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      return {};
    }
    const metadata: ParsedQuestionMetadata = {};
    if (parsed.scale === "A" || parsed.scale === "B") {
      metadata.scale = parsed.scale;
    }
    if (Array.isArray(parsed.options)) {
      const options = parsed.options
        .filter((item): item is SurveyOption => {
          return (
            isObject(item) &&
            typeof item.value === "string" &&
            item.value.trim().length > 0 &&
            typeof item.label === "string" &&
            item.label.trim().length > 0
          );
        })
        .map((item) => ({ value: item.value.trim(), label: item.label.trim() }));
      if (options.length > 0) {
        metadata.options = options;
      }
    }
    if (Array.isArray(parsed.exclusiveOptions)) {
      const exclusiveOptions = parsed.exclusiveOptions
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim());
      if (exclusiveOptions.length > 0) {
        metadata.exclusiveOptions = exclusiveOptions;
      }
    }
    return metadata;
  } catch {
    return {};
  }
}

async function ensureSurveyStructure(definitionId: string) {
  for (const section of SURVEY_SECTIONS) {
    await prisma.diagnosisSurveySection.upsert({
      where: {
        definitionId_sectionKey: {
          definitionId,
          sectionKey: section.sectionKey,
        },
      },
      create: {
        definitionId,
        sectionKey: section.sectionKey,
        title: section.title,
        orderIndex: section.orderIndex,
      },
      update: {
        title: section.title,
        orderIndex: section.orderIndex,
      },
    });
  }

  const sections = await prisma.diagnosisSurveySection.findMany({
    where: { definitionId },
    select: { id: true, sectionKey: true },
  });
  const sectionIdByKey = new Map(sections.map((section) => [section.sectionKey, section.id]));

  for (const question of SURVEY_QUESTION_SEEDS) {
    const metadata = getQuestionMetadata(question);
    await prisma.diagnosisSurveyQuestion.upsert({
      where: {
        definitionId_questionKey: {
          definitionId,
          questionKey: question.questionKey,
        },
      },
      create: {
        definitionId,
        sectionId: sectionIdByKey.get(question.sectionKey) ?? null,
        questionKey: question.questionKey,
        prompt: question.prompt,
        questionType: question.questionType,
        interpretationNote: metadata ? stringifyJson(metadata) : null,
        isRequired: question.isRequired ?? true,
        scaleMin: question.scaleMin ?? null,
        scaleMax: question.scaleMax ?? null,
        allowsNoInformation: question.allowsNoInformation ?? false,
        orderIndex: question.orderIndex,
      },
      update: {
        sectionId: sectionIdByKey.get(question.sectionKey) ?? null,
        prompt: question.prompt,
        questionType: question.questionType,
        interpretationNote: metadata ? stringifyJson(metadata) : null,
        isRequired: question.isRequired ?? true,
        scaleMin: question.scaleMin ?? null,
        scaleMax: question.scaleMax ?? null,
        allowsNoInformation: question.allowsNoInformation ?? false,
        orderIndex: question.orderIndex,
      },
    });
  }
}

export async function ensureActiveDiagnosisSurveyDefinition() {
  const existing = await prisma.diagnosisSurveyDefinition.findUnique({
    where: { version: ACTIVE_SURVEY_VERSION },
    include: {
      sections: { orderBy: { orderIndex: "asc" } },
      questions: { include: { section: true }, orderBy: { orderIndex: "asc" } },
    },
  });

  if (existing) {
    if (!existing.isActive) {
      await prisma.diagnosisSurveyDefinition.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    await prisma.diagnosisSurveyDefinition.updateMany({
      where: {
        id: { not: existing.id },
        isActive: true,
      },
      data: { isActive: false },
    });
    await ensureSurveyStructure(existing.id);
    return prisma.diagnosisSurveyDefinition.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        sections: { orderBy: { orderIndex: "asc" } },
        questions: { include: { section: true }, orderBy: { orderIndex: "asc" } },
      },
    });
  }

  const definitionData = {
    version: ACTIVE_SURVEY_VERSION,
    name: "Focused Diagnosis v2 Full Guide",
    isActive: true,
    scaleDefinitionJson: stringifyJson({
      scales: {
        A: {
          "1": "No sabemos como hacerlo",
          "2": "Sabemos un poco, pero no lo suficiente para hacerlo bien",
          "3": "En general sabemos como hacerlo",
          "4": "Sabemos hacerlo bien",
          "5": "Sabemos hacerlo muy bien y podriamos ensenar a otros",
          no_information: "No se / No tengo informacion suficiente",
        },
        B: {
          "1": "No se hace / no existe",
          "2": "Se hace en pocos lugares o de forma irregular",
          "3": "Se hace en varios lugares, pero de forma desigual",
          "4": "Se hace de forma consistente y generalmente bien",
          "5": "Se hace consistentemente, se revisa y se mejora con el tiempo",
          no_information: "No se / No tengo informacion suficiente",
        },
      },
    }),
    interpretationGuideJson: stringifyJson({
      enabler: "Digital capacity is acting as an enabler for strategic execution.",
      bottleneck: "Digital capacity gaps are creating operational bottlenecks.",
      risk: "Security or adaptability gaps introduce execution risk.",
    }),
  } as const;

  const created = await prisma.diagnosisSurveyDefinition.upsert({
    where: { version: ACTIVE_SURVEY_VERSION },
    create: definitionData,
    update: {
      name: definitionData.name,
      isActive: true,
      scaleDefinitionJson: definitionData.scaleDefinitionJson,
      interpretationGuideJson: definitionData.interpretationGuideJson,
    },
  });

  await prisma.diagnosisSurveyDefinition.updateMany({
    where: {
      id: { not: created.id },
      isActive: true,
    },
    data: { isActive: false },
  });

  await ensureSurveyStructure(created.id);

  return prisma.diagnosisSurveyDefinition.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      sections: { orderBy: { orderIndex: "asc" } },
      questions: { include: { section: true }, orderBy: { orderIndex: "asc" } },
    },
  });
}

export async function getActiveDiagnosisSurveyDefinition() {
  const definition = await ensureActiveDiagnosisSurveyDefinition();
  return definition;
}

function parseLikertAnswer(answer: DiagnosisAnswerInput, question: QuestionDefinition, questionKey: string) {
  if ("optionValue" in answer) {
    if (!question.allowsNoInformation || answer.optionValue !== "no_information") {
      throw new Error(`Invalid option value for ${questionKey}.`);
    }
    return {
      numericValue: null,
      optionValue: "no_information",
      textValue: null,
      isNoInformation: true,
    };
  }

  if (!("numericValue" in answer)) {
    throw new Error(`Question ${questionKey} requires a numeric answer.`);
  }

  const value = Number(answer.numericValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Question ${questionKey} requires a numeric value.`);
  }

  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 5;
  if (value < min || value > max) {
    throw new Error(`Question ${questionKey} must be between ${min} and ${max} or no_information.`);
  }

  return {
    numericValue: value,
    optionValue: null,
    textValue: null,
    isNoInformation: false,
  };
}

function parseOpenAnswer(answer: DiagnosisAnswerInput, questionKey: string) {
  if (!("textValue" in answer)) {
    throw new Error(`Question ${questionKey} requires a text answer.`);
  }

  const text = answer.textValue.trim();
  if (!text) {
    throw new Error(`Question ${questionKey} requires non-empty text.`);
  }

  return {
    numericValue: null,
    optionValue: null,
    textValue: text,
    isNoInformation: false,
  };
}

function parseSingleSelectAnswer(answer: DiagnosisAnswerInput, question: QuestionDefinition, questionKey: string) {
  if (!("optionValue" in answer)) {
    throw new Error(`Question ${questionKey} requires selecting one option.`);
  }

  const metadata = parseQuestionMetadata(question.interpretationNote);
  const allowedOptions = new Set((metadata.options ?? []).map((option) => option.value));
  if (allowedOptions.size > 0 && !allowedOptions.has(answer.optionValue)) {
    throw new Error(`Invalid option value for ${questionKey}.`);
  }

  return {
    numericValue: null,
    optionValue: answer.optionValue,
    textValue: null,
    isNoInformation: answer.optionValue === "no_information",
  };
}

function parseMultiSelectAnswer(answer: DiagnosisAnswerInput, question: QuestionDefinition, questionKey: string) {
  if (!("optionValues" in answer) || !Array.isArray(answer.optionValues)) {
    throw new Error(`Question ${questionKey} requires selecting one or more options.`);
  }

  const selectedValues = Array.from(
    new Set(
      answer.optionValues
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
  if (selectedValues.length === 0) {
    throw new Error(`Question ${questionKey} requires selecting one or more options.`);
  }

  const metadata = parseQuestionMetadata(question.interpretationNote);
  const allowedOptions = new Set((metadata.options ?? []).map((option) => option.value));
  if (allowedOptions.size > 0) {
    const invalidValue = selectedValues.find((value) => !allowedOptions.has(value));
    if (invalidValue) {
      throw new Error(`Invalid option value \"${invalidValue}\" for ${questionKey}.`);
    }
  }

  const exclusiveOptions = new Set(metadata.exclusiveOptions ?? []);
  const selectedExclusive = selectedValues.filter((value) => exclusiveOptions.has(value));
  if (selectedExclusive.length > 0 && selectedValues.length > 1) {
    throw new Error(`Question ${questionKey} has mutually exclusive options.`);
  }

  return {
    numericValue: null,
    optionValue: selectedValues.includes("no_information") ? "no_information" : null,
    textValue: stringifyJson({ selectedOptions: selectedValues }),
    isNoInformation: selectedValues.includes("no_information"),
  };
}

function parseGuide(guideJson: string | null): Record<string, string> {
  if (!guideJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(guideJson);
    return isObject(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
  } catch {
    return {};
  }
}

type InterpretationSummary = {
  classification: "enabler" | "bottleneck" | "risk";
  signals: string[];
};

function summarizeInterpretation(scores: Record<string, number | null>): InterpretationSummary {
  const d1 = scores.D1;
  const d2 = scores.D2;
  const d3 = scores.D3;
  const d4 = scores.D4;
  const d5 = scores.D5;
  const d6 = scores.D6;

  const signals: string[] = [];
  if ((d1 ?? 5) <= 2 || (d3 ?? 5) <= 2) {
    signals.push("access-collaboration");
  }
  if ((d2 ?? 5) <= 2 || (d4 ?? 5) <= 2) {
    signals.push("information-tracking");
  }
  if ((d5 ?? 5) <= 2) {
    signals.push("adaptability");
  }
  if ((d6 ?? 5) <= 2) {
    signals.push("digital-security");
  }

  const validScores = Object.values(scores).filter((value): value is number => typeof value === "number");
  const average = validScores.length
    ? validScores.reduce((sum, value) => sum + value, 0) / validScores.length
    : 0;

  if (signals.includes("digital-security")) {
    return { classification: "risk", signals };
  }

  if (signals.length > 0 || average < 3.5) {
    return { classification: "bottleneck", signals };
  }

  return { classification: "enabler", signals };
}

type PreparedDiagnosisAnswer = {
  questionId: string;
  numericValue: number | null;
  optionValue: string | null;
  textValue: string | null;
  isNoInformation: boolean;
};

function parseMultiSelectTextValue(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || !Array.isArray(parsed.selectedOptions)) {
      return raw;
    }
    const selected = parsed.selectedOptions
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return selected.length > 0 ? selected.join(" | ") : null;
  } catch {
    return raw;
  }
}

async function syncDiagnosisSubmissionToGoogleSheets(input: {
  responseId: string;
  organizationId: string;
  submittedById: string | null;
  submittedAt: Date;
  definitionVersion: string;
  preparedAnswers: PreparedDiagnosisAnswer[];
  questions: QuestionDefinition[];
}) {
  const [organization, submittedBy] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true },
    }),
    input.submittedById
      ? prisma.user.findUnique({
          where: { id: input.submittedById },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const answers: Record<string, string | number | boolean | null> = {};
  const digitalScores: Record<string, number | null> = {
    D1: null,
    D2: null,
    D3: null,
    D4: null,
    D5: null,
    D6: null,
  };

  let keyBarrier: string | null = null;

  for (const answer of input.preparedAnswers) {
    const question = questionById.get(answer.questionId);
    if (!question) {
      continue;
    }

    let normalizedValue: string | number | boolean | null = null;
    if (typeof answer.numericValue === "number") {
      normalizedValue = answer.numericValue;
    } else if (answer.optionValue) {
      normalizedValue = answer.optionValue;
    } else if (answer.textValue) {
      normalizedValue =
        question.questionType === "multi_select"
          ? parseMultiSelectTextValue(answer.textValue)
          : answer.textValue;
    } else if (answer.isNoInformation) {
      normalizedValue = "no_information";
    }

    answers[question.questionKey] = normalizedValue;

    if (DIGITAL_QUESTION_KEYS.includes(question.questionKey as (typeof DIGITAL_QUESTION_KEYS)[number])) {
      digitalScores[question.questionKey] = typeof normalizedValue === "number" ? normalizedValue : null;
    }
    if (question.questionKey === OPEN_QUESTION_KEY) {
      keyBarrier = typeof normalizedValue === "string" ? normalizedValue : null;
    }
  }

  const interpretation = summarizeInterpretation(digitalScores);
  await syncDiagnosisToGoogleSheets({
    event: "diagnosis_survey_submitted",
    emittedAt: new Date().toISOString(),
    responseId: input.responseId,
    organization: {
      id: input.organizationId,
      name: organization?.name ?? input.organizationId,
    },
    submittedBy: {
      id: submittedBy?.id ?? input.submittedById ?? null,
      name: submittedBy?.name ?? null,
    },
    definitionVersion: input.definitionVersion,
    submittedAt: input.submittedAt.toISOString(),
    interpretation: {
      classification: interpretation.classification,
      keyBarrier,
      digitalScores,
    },
    answers,
  });
}

export async function submitDiagnosisSurveyResponse(input: {
  organizationId: string;
  submittedById?: string;
  answers: Record<string, DiagnosisAnswerInput>;
}) {
  const definition = await getActiveDiagnosisSurveyDefinition();
  const questions = definition.questions as unknown as QuestionDefinition[];
  const requiredQuestions = questions.filter((question) => question.isRequired);
  for (const question of requiredQuestions) {
    if (!input.answers[question.questionKey]) {
      throw new Error(`Missing answer for ${question.questionKey}.`);
    }
  }

  const preparedAnswers = questions
    .map((question) => {
      const answerInput = input.answers[question.questionKey];
      if (!answerInput) {
        return null;
      }

      if (question.questionType === "likert_1_5") {
        return { questionId: question.id, ...parseLikertAnswer(answerInput, question, question.questionKey) };
      }
      if (question.questionType === "open_text") {
        return { questionId: question.id, ...parseOpenAnswer(answerInput, question.questionKey) };
      }
      if (question.questionType === "single_select") {
        return {
          questionId: question.id,
          ...parseSingleSelectAnswer(answerInput, question, question.questionKey),
        };
      }
      if (question.questionType === "multi_select") {
        return {
          questionId: question.id,
          ...parseMultiSelectAnswer(answerInput, question, question.questionKey),
        };
      }

      throw new Error(`Unsupported question type for ${question.questionKey}.`);
    })
    .filter((answer): answer is NonNullable<typeof answer> => Boolean(answer));

  const response = await prisma.$transaction(async (tx) => {
    const created = await tx.diagnosisSurveyResponse.create({
      data: {
        organizationId: input.organizationId,
        definitionId: definition.id,
        submittedById: input.submittedById ?? null,
        responseStatus: "submitted",
      },
    });

    await tx.diagnosisSurveyAnswer.createMany({
      data: preparedAnswers.map((answer) => ({
        responseId: created.id,
        questionId: answer.questionId,
        numericValue: answer.numericValue,
        optionValue: answer.optionValue,
        textValue: answer.textValue,
        isNoInformation: answer.isNoInformation,
      })),
    });

    return created;
  });

  try {
    await syncDiagnosisSubmissionToGoogleSheets({
      responseId: response.id,
      organizationId: input.organizationId,
      submittedById: input.submittedById ?? null,
      submittedAt: response.submittedAt,
      definitionVersion: definition.version,
      preparedAnswers,
      questions,
    });
  } catch (error) {
    console.error("Failed to sync diagnosis response to Google Sheets.", error);
  }

  return {
    responseId: response.id,
    definitionVersion: definition.version,
  };
}

export async function getLatestDiagnosisSummary(organizationId: string) {
  await ensureActiveDiagnosisSurveyDefinition();

  const latest = await prisma.diagnosisSurveyResponse.findFirst({
    where: { organizationId },
    include: {
      definition: true,
      answers: { include: { question: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  if (!latest) {
    return null;
  }

  const scores: Record<string, number | null> = {
    D1: null,
    D2: null,
    D3: null,
    D4: null,
    D5: null,
    D6: null,
  };
  let keyBarrier: string | null = null;

  for (const answer of latest.answers) {
    const key = answer.question.questionKey;
    if (DIGITAL_QUESTION_KEYS.includes(key as (typeof DIGITAL_QUESTION_KEYS)[number])) {
      scores[key] = answer.isNoInformation ? null : answer.numericValue;
    }
    if (key === OPEN_QUESTION_KEY) {
      keyBarrier = answer.textValue ?? null;
    }
  }

  const interpretation = summarizeInterpretation(scores);
  const guidance = parseGuide(latest.definition.interpretationGuideJson);

  return {
    responseId: latest.id,
    submittedAt: latest.submittedAt,
    definitionVersion: latest.definition.version,
    scores,
    keyBarrier,
    interpretation,
    interpretationGuidance: guidance,
  };
}

export function isDigitalQuestionKey(questionKey: string) {
  return DIGITAL_QUESTION_KEYS.includes(questionKey as (typeof DIGITAL_QUESTION_KEYS)[number]);
}

export function getQuestionByKey(questionKey: string, questions: QuestionDefinition[]) {
  return questions.find((question) => question.questionKey === questionKey) ?? null;
}

export async function parseDiagnosisFormAnswers(formData: FormData) {
  const definition = await getActiveDiagnosisSurveyDefinition();
  const answers: Record<string, DiagnosisAnswerInput> = {};

  for (const question of definition.questions) {
    if (question.questionType === "multi_select") {
      const selectedValues = formData
        .getAll(question.questionKey)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (selectedValues.length > 0) {
        answers[question.questionKey] = { optionValues: selectedValues };
      }
      continue;
    }

    const value = formData.get(question.questionKey);
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    if (question.questionType === "likert_1_5") {
      if (value === "no_information") {
        answers[question.questionKey] = {
          optionValue: "no_information",
          isNoInformation: true,
        };
      } else {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          answers[question.questionKey] = { numericValue: parsed };
        }
      }
      continue;
    }

    if (question.questionType === "single_select") {
      answers[question.questionKey] = { optionValue: value };
      continue;
    }

    if (question.questionType === "open_text") {
      answers[question.questionKey] = { textValue: value };
    }
  }

  return answers;
}
