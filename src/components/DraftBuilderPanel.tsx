import { prisma } from "@/lib/prisma";
import {
  saveDraftObjectiveResultAction,
  saveDraftLineOfActionAction,
  saveDraftAssumptionRiskAction,
  saveDraftSnapshotAction,
  seedDraftFromFrameworkAction,
} from "@/app/actions/draft";
import { fetchDraftReadinessInput } from "@/lib/draft-readiness-sync";
import { computeDraftReadiness } from "@/lib/draft-readiness";
import DraftReadinessIndicator from "./DraftReadinessIndicator";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import "./draft-builder.css";

type DraftBuilderPanelProps = {
  lang: Locale;
  organizationId: string;
  role: string;
};

export default async function DraftBuilderPanel({
  lang,
  organizationId,
  role,
}: DraftBuilderPanelProps) {
  const dict = await getDictionary(lang);
  const d = dict.draft;
  const isEditable = role === "ngo_admin";

  // Seed from Phase 3 framework if first visit
  const existingObjectiveCount = await prisma.draftObjectiveResult.count({
    where: { organizationId },
  });
  if (existingObjectiveCount === 0 && isEditable) {
    await seedDraftFromFrameworkAction(organizationId);
  }

  // Fetch all draft data + readiness in parallel
  const [objectives, lines, assumptionsRisks, snapshots, readinessInput] =
    await Promise.all([
      prisma.draftObjectiveResult.findMany({
        where: { organizationId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.draftLineOfAction.findMany({
        where: { organizationId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.draftAssumptionRisk.findMany({
        where: { organizationId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.draftSnapshot.findMany({
        where: { organizationId },
        orderBy: { versionNumber: "desc" },
        take: 10,
      }),
      fetchDraftReadinessInput(organizationId),
    ]);

  const readiness = computeDraftReadiness(readinessInput);
  const latestSnapshot = snapshots[0] ?? null;
  const assumptions = assumptionsRisks.filter((ar) => ar.type === "assumption");
  const risks = assumptionsRisks.filter((ar) => ar.type === "risk");

  return (
    <section className="draft-builder-panel" id="draft-builder">
      <header className="draft-builder-header">
        <h2>{d.title}</h2>
        <p className="draft-builder-subtitle">{d.subtitle}</p>
      </header>

      <DraftReadinessIndicator
        lang={lang}
        dict={dict}
        readiness={readiness}
      />

      {/* ── Section 1: Objectives & Results ─────────────────────── */}
      <details className="draft-section" open>
        <summary className="draft-section-toggle">
          <span className="draft-section-title">
            {readiness.sections.objectivesResults ? "✓" : "○"}{" "}
            {d.sections.objectives_results}
          </span>
        </summary>
        <div className="draft-section-content">
          {objectives.length === 0 ? (
            <p className="draft-empty">{d.no_entries}</p>
          ) : null}

          {objectives.map((obj) => (
            <div key={obj.id} className="draft-entry-card">
              {isEditable ? (
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await saveDraftObjectiveResultAction(formData);
                  }}
                  className="draft-entry-form"
                >
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="id" value={obj.id} />
                  <input type="hidden" name="sourceObjectiveId" value={obj.sourceObjectiveId ?? ""} />

                  <label className="draft-field">
                    <span>{d.fields.title}</span>
                    <input type="text" name="title" defaultValue={obj.title} required />
                  </label>
                  <label className="draft-field">
                    <span>{d.fields.description}</span>
                    <textarea name="description" rows={2} defaultValue={obj.description ?? ""} />
                  </label>
                  <label className="draft-field">
                    <span>{d.fields.expected_results}</span>
                    <textarea name="expectedResults" rows={3} defaultValue={obj.expectedResults ?? ""} placeholder={d.fields.expected_results} />
                  </label>
                  <div className="draft-field-row">
                    <label className="draft-field">
                      <span>{d.fields.owner}</span>
                      <input type="text" name="owner" defaultValue={obj.owner ?? ""} />
                    </label>
                    <label className="draft-field">
                      <span>{d.fields.timeline_start}</span>
                      <input type="date" name="timelineStart" defaultValue={obj.timelineStart?.toISOString().split("T")[0] ?? ""} />
                    </label>
                    <label className="draft-field">
                      <span>{d.fields.timeline_end}</span>
                      <input type="date" name="timelineEnd" defaultValue={obj.timelineEnd?.toISOString().split("T")[0] ?? ""} />
                    </label>
                  </div>
                  <button type="submit" className="draft-save-btn">{d.actions.save}</button>
                </form>
              ) : (
                <div className="draft-entry-readonly">
                  <h4>{obj.title}</h4>
                  {obj.description ? <p>{obj.description}</p> : null}
                  {obj.expectedResults ? (
                    <div className="draft-field-display">
                      <strong>{d.fields.expected_results}:</strong> {obj.expectedResults}
                    </div>
                  ) : null}
                  {obj.owner ? (
                    <div className="draft-field-display">
                      <strong>{d.fields.owner}:</strong> {obj.owner}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {isEditable ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveDraftObjectiveResultAction(formData);
              }}
              className="draft-add-form"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <label className="draft-field">
                <span>{d.fields.title}</span>
                <input type="text" name="title" required placeholder={d.fields.title} />
              </label>
              <label className="draft-field">
                <span>{d.fields.expected_results}</span>
                <textarea name="expectedResults" rows={2} placeholder={d.fields.expected_results} />
              </label>
              <button type="submit" className="draft-add-btn">{d.actions.add_objective}</button>
            </form>
          ) : null}
        </div>
      </details>

      {/* ── Section 2: Lines of Action & Initiatives ─────────── */}
      <details className="draft-section">
        <summary className="draft-section-toggle">
          <span className="draft-section-title">
            {readiness.sections.linesOfAction ? "✓" : "○"}{" "}
            {d.sections.lines_of_action}
          </span>
        </summary>
        <div className="draft-section-content">
          {lines.length === 0 ? (
            <p className="draft-empty">{d.no_entries}</p>
          ) : null}

          {lines.map((line) => {
            let initiatives: string[] = [];
            try {
              initiatives = line.initiativesJson ? JSON.parse(line.initiativesJson) : [];
            } catch {
              initiatives = [];
            }
            return (
              <div key={line.id} className="draft-entry-card">
                {isEditable ? (
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      await saveDraftLineOfActionAction(formData);
                    }}
                    className="draft-entry-form"
                  >
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="id" value={line.id} />

                    <label className="draft-field">
                      <span>{d.fields.title}</span>
                      <input type="text" name="title" defaultValue={line.title} required />
                    </label>
                    <label className="draft-field">
                      <span>{d.fields.initiatives}</span>
                      <textarea name="initiatives" rows={4} defaultValue={initiatives.join("\n")} placeholder={d.fields.initiatives} />
                    </label>
                    <div className="draft-field-row">
                      <label className="draft-field">
                        <span>{d.fields.timeline_start}</span>
                        <input type="date" name="timelineStart" defaultValue={line.timelineStart?.toISOString().split("T")[0] ?? ""} />
                      </label>
                      <label className="draft-field">
                        <span>{d.fields.timeline_end}</span>
                        <input type="date" name="timelineEnd" defaultValue={line.timelineEnd?.toISOString().split("T")[0] ?? ""} />
                      </label>
                    </div>

                    {objectives.length > 0 ? (
                      <label className="draft-field">
                        <span>{d.fields.linked_objective}</span>
                        <select name="objectiveResultId" defaultValue={line.objectiveResultId ?? ""}>
                          <option value="">—</option>
                          {objectives.map((obj) => (
                            <option key={obj.id} value={obj.id}>{obj.title}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <button type="submit" className="draft-save-btn">{d.actions.save}</button>
                  </form>
                ) : (
                  <div className="draft-entry-readonly">
                    <h4>{line.title}</h4>
                    {initiatives.length > 0 ? (
                      <ul className="draft-initiatives-list">
                        {initiatives.map((init, i) => (
                          <li key={i}>{init}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {isEditable ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveDraftLineOfActionAction(formData);
              }}
              className="draft-add-form"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <label className="draft-field">
                <span>{d.fields.title}</span>
                <input type="text" name="title" required placeholder={d.fields.title} />
              </label>
              <label className="draft-field">
                <span>{d.fields.initiatives}</span>
                <textarea name="initiatives" rows={3} placeholder={d.fields.initiatives} />
              </label>
              <button type="submit" className="draft-add-btn">{d.actions.add_line}</button>
            </form>
          ) : null}
        </div>
      </details>

      {/* ── Section 3: Assumptions & Risks ───────────────────── */}
      <details className="draft-section">
        <summary className="draft-section-toggle">
          <span className="draft-section-title">
            {readiness.sections.assumptionsRisks ? "✓" : "○"}{" "}
            {d.sections.assumptions_risks}
          </span>
        </summary>
        <div className="draft-section-content">
          {/* Assumptions sub-section */}
          <h4 className="draft-subsection-title">{d.types.assumption}</h4>
          {assumptions.length === 0 ? (
            <p className="draft-empty">{d.no_entries}</p>
          ) : null}
          {assumptions.map((ar) => (
            <div key={ar.id} className="draft-entry-card draft-entry-assumption">
              {isEditable ? (
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await saveDraftAssumptionRiskAction(formData);
                  }}
                  className="draft-entry-form"
                >
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="id" value={ar.id} />
                  <input type="hidden" name="type" value="assumption" />
                  <label className="draft-field">
                    <span>{d.fields.description}</span>
                    <textarea name="description" rows={2} defaultValue={ar.description} required />
                  </label>
                  <label className="draft-field">
                    <span>{d.fields.category}</span>
                    <input type="text" name="category" defaultValue={ar.category ?? ""} />
                  </label>
                  <button type="submit" className="draft-save-btn">{d.actions.save}</button>
                </form>
              ) : (
                <div className="draft-entry-readonly">
                  <p>{ar.description}</p>
                  {ar.category ? <span className="draft-tag">{ar.category}</span> : null}
                </div>
              )}
            </div>
          ))}
          {isEditable ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveDraftAssumptionRiskAction(formData);
              }}
              className="draft-add-form"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="type" value="assumption" />
              <label className="draft-field">
                <span>{d.fields.description}</span>
                <textarea name="description" rows={2} required placeholder={d.types.assumption} />
              </label>
              <button type="submit" className="draft-add-btn">{d.actions.add_assumption}</button>
            </form>
          ) : null}

          {/* Risks sub-section */}
          <h4 className="draft-subsection-title">{d.types.risk}</h4>
          {risks.length === 0 ? (
            <p className="draft-empty">{d.no_entries}</p>
          ) : null}
          {risks.map((ar) => (
            <div key={ar.id} className="draft-entry-card draft-entry-risk">
              {isEditable ? (
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await saveDraftAssumptionRiskAction(formData);
                  }}
                  className="draft-entry-form"
                >
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="id" value={ar.id} />
                  <input type="hidden" name="type" value="risk" />
                  <label className="draft-field">
                    <span>{d.fields.description}</span>
                    <textarea name="description" rows={2} defaultValue={ar.description} required />
                  </label>
                  <label className="draft-field">
                    <span>{d.fields.mitigation}</span>
                    <textarea name="mitigation" rows={2} defaultValue={ar.mitigation ?? ""} placeholder={d.fields.mitigation} />
                  </label>
                  <button type="submit" className="draft-save-btn">{d.actions.save}</button>
                </form>
              ) : (
                <div className="draft-entry-readonly">
                  <p>{ar.description}</p>
                  {ar.mitigation ? (
                    <div className="draft-field-display">
                      <strong>{d.fields.mitigation}:</strong> {ar.mitigation}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
          {isEditable ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveDraftAssumptionRiskAction(formData);
              }}
              className="draft-add-form"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="type" value="risk" />
              <label className="draft-field">
                <span>{d.fields.description}</span>
                <textarea name="description" rows={2} required placeholder={d.types.risk} />
              </label>
              <label className="draft-field">
                <span>{d.fields.mitigation}</span>
                <textarea name="mitigation" rows={2} placeholder={d.fields.mitigation} />
              </label>
              <button type="submit" className="draft-add-btn">{d.actions.add_risk}</button>
            </form>
          ) : null}
        </div>
      </details>

      {/* ── Section 4: Plan Narrative ────────────────────────── */}
      <details className="draft-section">
        <summary className="draft-section-toggle">
          <span className="draft-section-title">
            {readiness.sections.narrative ? "✓" : "○"}{" "}
            {d.sections.narrative}
          </span>
        </summary>
        <div className="draft-section-content">
          {isEditable ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                await saveDraftSnapshotAction(formData);
              }}
              className="draft-narrative-form"
            >
              <input type="hidden" name="organizationId" value={organizationId} />
              <label className="draft-field">
                <span>{d.fields.content}</span>
                <textarea
                  name="content"
                  rows={10}
                  defaultValue={latestSnapshot?.content ?? ""}
                  placeholder={d.fields.content}
                  required
                />
              </label>
              <button type="submit" className="draft-save-btn">{d.actions.save_version}</button>
            </form>
          ) : (
            <div className="draft-entry-readonly draft-narrative-readonly">
              {latestSnapshot ? (
                <div className="draft-narrative-content">{latestSnapshot.content}</div>
              ) : (
                <p className="draft-empty">{d.no_snapshots}</p>
              )}
            </div>
          )}

          {/* Version history */}
          {snapshots.length > 0 ? (
            <div className="draft-version-history">
              <h4>{d.version_history}</h4>
              <ul className="draft-version-list">
                {snapshots.map((snap) => (
                  <li key={snap.id} className="draft-version-item">
                    <strong>{d.version} {snap.versionNumber}</strong>
                    <span className="draft-version-date">
                      {snap.createdAt.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
