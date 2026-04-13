"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SparkleIcon } from "@/components/icons";
import {
  type CoachSuggestion,
  buildCoachSuggestion,
  getCoachPromptStarters,
} from "@/lib/phase-coach";
import type { Locale } from "@/i18n/config";

type PhaseCoachPanelProps = {
  lang: Locale;
  phaseNumber: number;
  role: string;
};

export default function PhaseCoachPanel(props: PhaseCoachPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [suggestion, setSuggestion] = useState<CoachSuggestion | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const starters = useMemo(
    () =>
      getCoachPromptStarters({
        lang: props.lang,
        phaseNumber: props.phaseNumber,
        role: props.role,
      }),
    [props.lang, props.phaseNumber, props.role],
  );

  const fallbackSuggestion = buildCoachSuggestion({
    lang: props.lang,
    phaseNumber: props.phaseNumber,
    role: props.role,
    prompt,
  });

  function generateGuidance(activePrompt: string) {
    startTransition(async () => {
      try {
        setErrorMessage(null);
        const response = await fetch("/api/coach/suggestions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lang: props.lang,
            phaseNumber: props.phaseNumber,
            prompt: activePrompt,
          }),
        });

        if (!response.ok) {
          throw new Error("Coach service unavailable");
        }

        const data = (await response.json()) as {
          suggestion?: CoachSuggestion;
        };
        setSuggestion(data.suggestion ?? fallbackSuggestion);
      } catch {
        setSuggestion(fallbackSuggestion);
        setErrorMessage(
          props.lang === "es"
            ? "No pudimos conectarnos con el coach ahora. Mostramos una guia base para que no se detenga el trabajo."
            : "Coach is temporarily unavailable. Showing baseline guidance so work can continue.",
        );
      }
    });
  }

  const activeSuggestion = suggestion ?? fallbackSuggestion;

  return (
    <section className="phase-coach-panel" aria-live="polite">
      <header className="phase-coach-header">
        <h2>
          <SparkleIcon size={16} />{" "}
          {props.lang === "es" ? "Acompañante estratégico" : "Strategic coach"}
        </h2>
        <p>
          {props.lang === "es"
            ? "Recibe orientación contextual para esta fase con pasos accionables."
            : "Get phase-context guidance with actionable next steps."}
        </p>
      </header>

      <div className="phase-coach-starters">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            className="phase-coach-starter"
            onClick={() => {
              setPrompt(starter);
              generateGuidance(starter);
            }}
          >
            {starter}
          </button>
        ))}
      </div>

      <label className="phase-coach-custom-label" htmlFor={`coach-prompt-${props.phaseNumber}`}>
        {props.lang === "es" ? "Consulta personalizada" : "Custom prompt"}
      </label>
      <div className="phase-coach-prompt-row">
        <textarea
          id={`coach-prompt-${props.phaseNumber}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          placeholder={
            props.lang === "es"
              ? "Escribe una pregunta sobre esta fase..."
              : "Write a question about this phase..."
          }
        />
        <button
          type="button"
          className="phase-coach-generate"
          onClick={() => generateGuidance(prompt)}
          disabled={isPending}
        >
          {isPending
            ? props.lang === "es"
              ? "Generando..."
              : "Generating..."
            : props.lang === "es"
              ? "Generar orientacion"
              : "Generate guidance"}
        </button>
      </div>

      {errorMessage ? <p className="phase-coach-fallback">{errorMessage}</p> : null}

      <div className="phase-coach-suggestion">
        <p>{activeSuggestion.summary}</p>
        <ul>
          {activeSuggestion.nextSteps.map((step) => (
            <li key={step.href + step.label}>
              <Link href={step.href}>{step.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
