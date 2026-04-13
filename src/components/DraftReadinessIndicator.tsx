import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { DraftReadinessResult } from "@/lib/draft-readiness";

type DraftReadinessIndicatorProps = {
  lang: Locale;
  dict: Dictionary;
  readiness: DraftReadinessResult;
};

const SECTION_KEYS = [
  "objectives_results",
  "lines_of_action",
  "assumptions_risks",
  "narrative",
] as const;

const SECTION_TO_READINESS_KEY: Record<
  (typeof SECTION_KEYS)[number],
  keyof DraftReadinessResult["sections"]
> = {
  objectives_results: "objectivesResults",
  lines_of_action: "linesOfAction",
  assumptions_risks: "assumptionsRisks",
  narrative: "narrative",
};

export default function DraftReadinessIndicator({
  dict,
  readiness,
}: DraftReadinessIndicatorProps) {
  const d = dict.draft.readiness;
  const missingSectionCount = readiness.missingSections.length;

  return (
    <section className="draft-readiness-indicator" id="draft-readiness">
      <h3>{d.title}</h3>

      {/* Progress bar */}
      <div className="draft-readiness-bar-container">
        <div
          className="draft-readiness-bar-fill"
          style={{ width: `${readiness.percentage}%` }}
          aria-valuenow={readiness.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        >
          <span className="draft-readiness-bar-label">
            {readiness.percentage}%
          </span>
        </div>
        {/* Threshold marker at 75% */}
        <div
          className="draft-readiness-threshold-marker"
          style={{ left: `${readiness.gateThreshold}%` }}
          title={`${d.gate_threshold}: ${readiness.gateThreshold}%`}
        />
      </div>

      {/* Section chips */}
      <div className="draft-readiness-sections">
        {SECTION_KEYS.map((sectionKey) => {
          const isComplete =
            readiness.sections[SECTION_TO_READINESS_KEY[sectionKey]];
          return (
            <div
              key={sectionKey}
              className={`draft-readiness-chip ${isComplete ? "chip-complete" : "chip-incomplete"}`}
            >
              <span className="chip-icon">
                {isComplete ? "✓" : "○"}
              </span>
              <span className="chip-label">
                {dict.draft.sections[sectionKey]}
              </span>
              <span className="chip-status">
                {isComplete ? d.section_complete : d.section_incomplete}
              </span>
            </div>
          );
        })}
      </div>

      {/* Gate status */}
      <div
        className={`draft-readiness-gate-status ${readiness.passesGate ? "gate-pass" : "gate-blocked"}`}
      >
        {readiness.passesGate
          ? d.ready_for_review
          : `${missingSectionCount} ${d.sections_remaining}`}
      </div>
    </section>
  );
}
