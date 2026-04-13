"use client";

import { useEffect, useState } from "react";
import { getExampleById } from "@/lib/example-library";
import type { Locale } from "@/i18n/config";

type PhasePatternDraftPadProps = {
  lang: Locale;
  phaseNumber: number;
  role: string;
  organizationId: string;
  initialPatternId?: string | null;
};

function canEditPattern(role: string) {
  return role === "ngo_admin";
}

type InitialDraftState = {
  draft: string;
  pendingPatternChoice: boolean;
  statusMessage: string | null;
};

function buildInitialDraftState(input: {
  storageKey: string;
  patternId?: string | null;
  lang: Locale;
  role: string;
}): InitialDraftState {
  const editable = canEditPattern(input.role);
  const selectedPattern =
    input.patternId
      ? getExampleById(input.patternId, input.lang)
      : null;

  const storedDraft =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(input.storageKey) ?? "";

  if (!selectedPattern) {
    return {
      draft: storedDraft,
      pendingPatternChoice: false,
      statusMessage: null,
    };
  }

  if (!editable) {
    return {
      draft: storedDraft,
      pendingPatternChoice: false,
      statusMessage:
        input.lang === "es"
          ? "Tu rol puede revisar patrones, pero no aplicarlos al borrador."
          : "Your role can review patterns, but cannot apply them to the draft.",
    };
  }

  if (storedDraft.trim().length === 0) {
    return {
      draft: selectedPattern.template,
      pendingPatternChoice: false,
      statusMessage:
        input.lang === "es"
          ? `Patron aplicado: ${selectedPattern.title}`
          : `Pattern applied: ${selectedPattern.title}`,
    };
  }

  return {
    draft: storedDraft,
    pendingPatternChoice: true,
    statusMessage:
      input.lang === "es"
        ? `Ya existe contenido. Elige combinar o reemplazar para aplicar: ${selectedPattern.title}`
        : `Existing content detected. Choose merge or replace to apply: ${selectedPattern.title}`,
  };
}

export default function PhasePatternDraftPad(props: PhasePatternDraftPadProps) {
  const storageKey = `phase-draft:${props.organizationId}:${props.phaseNumber}`;
  const editable = canEditPattern(props.role);
  const selectedPattern = props.initialPatternId
    ? getExampleById(props.initialPatternId, props.lang)
    : null;
  const [initialState] = useState(() =>
    buildInitialDraftState({
      storageKey,
      patternId: props.initialPatternId,
      lang: props.lang,
      role: props.role,
    }),
  );
  const [draft, setDraft] = useState(initialState.draft);
  const [pendingPatternChoice, setPendingPatternChoice] = useState(
    initialState.pendingPatternChoice,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    initialState.statusMessage,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(storageKey, draft);
  }, [draft, storageKey]);

  function applyMerge() {
    if (!selectedPattern) {
      return;
    }
    const trimmed = draft.trim();
    const merged =
      trimmed.length === 0
        ? selectedPattern.template
        : `${trimmed}\n\n---\n\n${selectedPattern.template}`;
    setDraft(merged);
    setPendingPatternChoice(false);
    setStatusMessage(
      props.lang === "es"
        ? `Patron combinado: ${selectedPattern.title}`
        : `Pattern merged: ${selectedPattern.title}`,
    );
  }

  function applyReplace() {
    if (!selectedPattern) {
      return;
    }
    setDraft(selectedPattern.template);
    setPendingPatternChoice(false);
    setStatusMessage(
      props.lang === "es"
        ? `Patron reemplazo el contenido actual: ${selectedPattern.title}`
        : `Pattern replaced current content: ${selectedPattern.title}`,
    );
  }

  return (
    <section className="phase-draft-pad" id="phase-draft-pad">
      <header>
        <h2>{props.lang === "es" ? "Borrador de trabajo" : "Working draft"}</h2>
        <p>
          {props.lang === "es"
            ? "Espacio rapido para estructurar contenido de la fase con apoyo de patrones."
            : "Quick space to structure phase content with pattern support."}
        </p>
      </header>

      {statusMessage ? <p className="phase-draft-status">{statusMessage}</p> : null}

      {pendingPatternChoice && selectedPattern ? (
        <div className="phase-draft-pattern-choice">
          <p>
            {props.lang === "es"
              ? "Selecciona como aplicar el patron al borrador actual:"
              : "Select how to apply this pattern to the current draft:"}
          </p>
          <div className="phase-draft-pattern-actions">
            <button type="button" onClick={applyMerge} className="phase-output-toggle">
              {props.lang === "es" ? "Combinar" : "Merge"}
            </button>
            <button type="button" onClick={applyReplace} className="phase-output-toggle">
              {props.lang === "es" ? "Reemplazar" : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => setPendingPatternChoice(false)}
              className="phase-output-toggle"
            >
              {props.lang === "es" ? "Mantener actual" : "Keep current"}
            </button>
          </div>
        </div>
      ) : null}

      <textarea
        className="phase-draft-textarea"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={12}
        readOnly={!editable}
        placeholder={
          props.lang === "es"
            ? "Captura acuerdos, decisiones y siguiente paso de esta fase..."
            : "Capture agreements, decisions, and next step for this phase..."
        }
      />

      {!editable ? (
        <p className="phase-review-hint">
          {props.lang === "es"
            ? "Solo el rol ngo_admin puede editar este borrador."
            : "Only ngo_admin role can edit this draft."}
        </p>
      ) : null}
    </section>
  );
}
