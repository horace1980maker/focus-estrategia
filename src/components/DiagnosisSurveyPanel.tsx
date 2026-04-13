import { submitDiagnosisSurveyAction } from "@/app/actions/diagnosis";
import {
  getActiveDiagnosisSurveyDefinition,
  getLatestDiagnosisSummary,
} from "@/lib/diagnosis-survey";
import type { Locale } from "@/i18n/config";

type DiagnosisSurveyPanelProps = {
  lang: Locale;
  organizationId: string;
};

type SurveyOption = {
  value: string;
  label: string;
};

type QuestionMetadata = {
  options: SurveyOption[];
  scale: "A" | "B" | null;
};

type ScaleCollection = Record<"A" | "B", Record<string, string>>;

const FALLBACK_OPTIONS: Record<string, SurveyOption[]> = {
  C1: [
    { value: "no_plan_or_outdated_3y", label: "No existe o esta desactualizado hace mas de 3 anos" },
    { value: "updated_2_to_3y", label: "Existe, pero fue actualizado hace entre 2 y 3 anos" },
    { value: "updated_12_to_24m", label: "Existe y fue actualizado hace entre 12 y 24 meses" },
    { value: "updated_last_12m", label: "Existe y fue actualizado en los ultimos 12 meses" },
    { value: "no_information", label: "No se / No tengo informacion suficiente" },
  ],
  C2: [
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
};

function parseQuestionMetadata(raw: string | null): QuestionMetadata {
  const empty: QuestionMetadata = { options: [], scale: null };
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw) as {
      options?: Array<{ value?: string; label?: string }>;
      scale?: unknown;
    };
    const options = Array.isArray(parsed.options)
      ? parsed.options
          .filter((option): option is SurveyOption => {
            return (
              typeof option.value === "string" &&
              option.value.trim().length > 0 &&
              typeof option.label === "string" &&
              option.label.trim().length > 0
            );
          })
          .map((option) => ({
            value: option.value.trim(),
            label: option.label.trim(),
          }))
      : [];
    const scale = parsed.scale === "A" || parsed.scale === "B" ? parsed.scale : null;
    return { options, scale };
  } catch {
    return empty;
  }
}

function parseScaleCollection(raw: string | null): ScaleCollection {
  const fallback: ScaleCollection = {
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
  };

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as {
      scales?: Record<string, Record<string, unknown>>;
    };
    if (!parsed.scales || typeof parsed.scales !== "object") {
      return fallback;
    }

    for (const key of ["A", "B"] as const) {
      const scale = parsed.scales[key];
      if (!scale || typeof scale !== "object") {
        continue;
      }
      for (const entry of Object.keys(fallback[key])) {
        const rawLabel = scale[entry];
        if (typeof rawLabel === "string" && rawLabel.trim().length > 0) {
          fallback[key][entry] = rawLabel.trim();
        }
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function getQuestionOptions(questionKey: string, options: SurveyOption[]): SurveyOption[] {
  if (options.length > 0) {
    return options;
  }
  return FALLBACK_OPTIONS[questionKey] ?? [];
}

export default async function DiagnosisSurveyPanel({
  lang,
  organizationId,
}: DiagnosisSurveyPanelProps) {
  const [definition, latestSummary] = await Promise.all([
    getActiveDiagnosisSurveyDefinition(),
    getLatestDiagnosisSummary(organizationId),
  ]);

  const sections = [...definition.sections].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const scales = parseScaleCollection(definition.scaleDefinitionJson);

  const questionsBySectionId = new Map<string, typeof definition.questions>();
  for (const question of definition.questions) {
    if (!question.sectionId) {
      continue;
    }
    const current = questionsBySectionId.get(question.sectionId) ?? [];
    current.push(question);
    questionsBySectionId.set(question.sectionId, current);
  }

  return (
    <section className="diagnosis-panel">
      <h2>
        {lang === "es"
          ? "Diagnostico focalizado"
          : "Focused diagnosis"}
      </h2>
      <p>
        {lang === "es"
          ? "Complete todas las secciones del instrumento activo para registrar el punto de partida estrategico de la organizacion."
          : "Complete all sections from the active instrument to register the organization's strategic baseline."}
      </p>

      <form
        action={async (formData: FormData) => {
          "use server";
          await submitDiagnosisSurveyAction(formData);
        }}
        className="diagnosis-form"
      >
        {sections.map((section) => {
          const sectionQuestions = [...(questionsBySectionId.get(section.id) ?? [])].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );

          return (
            <fieldset key={section.id} className="diagnosis-section">
              <legend className="diagnosis-section-title">
                {section.sectionKey}. {section.title}
              </legend>

              {sectionQuestions.length === 0 ? (
                <p className="diagnosis-empty">
                  {lang === "es"
                    ? "No hay preguntas configuradas para esta seccion."
                    : "No questions are configured for this section."}
                </p>
              ) : null}

              {sectionQuestions.map((question) => {
                const metadata = parseQuestionMetadata(question.interpretationNote);
                const options = getQuestionOptions(question.questionKey, metadata.options);

                if (question.questionType === "likert_1_5") {
                  const fallbackScale = section.sectionKey === "A" ? "A" : "B";
                  const scaleKey = metadata.scale ?? fallbackScale;
                  const scaleLabels = scales[scaleKey];

                  return (
                    <label key={question.id} className="diagnosis-field">
                      <span className="diagnosis-label">{question.questionKey}</span>
                      <span className="diagnosis-prompt">{question.prompt}</span>
                      <select
                        name={question.questionKey}
                        required={question.isRequired}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {lang === "es" ? "Seleccione una opcion" : "Select an option"}
                        </option>
                        <option value="1">{`1 - ${scaleLabels["1"]}`}</option>
                        <option value="2">{`2 - ${scaleLabels["2"]}`}</option>
                        <option value="3">{`3 - ${scaleLabels["3"]}`}</option>
                        <option value="4">{`4 - ${scaleLabels["4"]}`}</option>
                        <option value="5">{`5 - ${scaleLabels["5"]}`}</option>
                        {question.allowsNoInformation ? (
                          <option value="no_information">
                            {scaleLabels.no_information}
                          </option>
                        ) : null}
                      </select>
                    </label>
                  );
                }

                if (question.questionType === "single_select") {
                  return (
                    <label key={question.id} className="diagnosis-field">
                      <span className="diagnosis-label">{question.questionKey}</span>
                      <span className="diagnosis-prompt">{question.prompt}</span>
                      {options.length === 0 ? (
                        <span className="diagnosis-empty">
                          {lang === "es"
                            ? "No hay opciones configuradas para esta pregunta."
                            : "No options are configured for this question."}
                        </span>
                      ) : null}
                      <select
                        name={question.questionKey}
                        required={question.isRequired}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {lang === "es" ? "Seleccione una opcion" : "Select an option"}
                        </option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (question.questionType === "multi_select") {
                  return (
                    <fieldset key={question.id} className="diagnosis-field diagnosis-checkbox-group">
                      <legend className="diagnosis-label">{question.questionKey}</legend>
                      <span className="diagnosis-prompt">{question.prompt}</span>
                      {options.length === 0 ? (
                        <span className="diagnosis-empty">
                          {lang === "es"
                            ? "No hay opciones configuradas para esta pregunta."
                            : "No options are configured for this question."}
                        </span>
                      ) : null}
                      {options.map((option) => (
                        <label key={option.value} className="diagnosis-checkbox-option">
                          <input
                            type="checkbox"
                            name={question.questionKey}
                            value={option.value}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  );
                }

                if (question.questionType === "open_text") {
                  return (
                    <label key={question.id} className="diagnosis-field">
                      <span className="diagnosis-label">{question.questionKey}</span>
                      <span className="diagnosis-prompt">{question.prompt}</span>
                      <textarea
                        name={question.questionKey}
                        required={question.isRequired}
                        rows={3}
                        placeholder={
                          lang === "es"
                            ? "Escriba su respuesta..."
                            : "Write your answer..."
                        }
                      />
                    </label>
                  );
                }

                return null;
              })}
            </fieldset>
          );
        })}

        <button type="submit" className="diagnosis-submit">
          {lang === "es" ? "Guardar diagnostico" : "Save diagnosis"}
        </button>
      </form>

      {latestSummary ? (
        <div className="diagnosis-summary">
          <h3>{lang === "es" ? "Ultimo resultado guardado" : "Latest saved result"}</h3>
          <p>
            {lang === "es" ? "Version del instrumento" : "Instrument version"}:{" "}
            <strong>{latestSummary.definitionVersion}</strong>
          </p>
          <p>
            {lang === "es" ? "Clasificacion" : "Classification"}:{" "}
            <strong>{latestSummary.interpretation.classification}</strong>
          </p>
          <p>
            {lang === "es" ? "Barrera principal (C5)" : "Main barrier (C5)"}:{" "}
            {latestSummary.keyBarrier ?? (lang === "es" ? "Sin respuesta" : "No answer")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
