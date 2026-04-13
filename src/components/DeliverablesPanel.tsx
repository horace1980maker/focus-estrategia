import {
  approveDeliverableAction,
  createOrRegenerateDeliverableAction,
  publishDeliverableAction,
  refreshDeliverableReadinessAction,
  requestDeliverableExportAction,
  submitDeliverableForReviewAction,
} from "@/app/actions/deliverables";
import { ROLES } from "@/lib/auth";
import { listDeliverableVersions } from "@/lib/deliverables";
import type { Locale } from "@/i18n/config";

type SourcePhaseRef = {
  phaseNumber: number;
  phaseKey: string;
  status: string;
  requiredOutputCount: number;
  completedOutputCount: number;
};

function parseSourcePhaseRefs(sourcePhaseRefsJson: string | null): SourcePhaseRef[] {
  if (!sourcePhaseRefsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(sourcePhaseRefsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is SourcePhaseRef => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as SourcePhaseRef).phaseNumber === "number" &&
        typeof (item as SourcePhaseRef).phaseKey === "string" &&
        typeof (item as SourcePhaseRef).status === "string" &&
        typeof (item as SourcePhaseRef).requiredOutputCount === "number" &&
        typeof (item as SourcePhaseRef).completedOutputCount === "number"
      );
    });
  } catch {
    return [];
  }
}

type DeliverablesPanelProps = {
  lang: Locale;
  organizationId: string;
  role: string;
};

export default async function DeliverablesPanel({
  lang,
  organizationId,
  role,
}: DeliverablesPanelProps) {
  const versions = await listDeliverableVersions(organizationId);
  const latest = versions[0] ?? null;
  const canManageDeliverables = role === ROLES.NGO_ADMIN;
  const canReviewDeliverables = role === ROLES.FACILITATOR;

  return (
    <section className="deliverables-panel">
      <header className="deliverables-header">
        <h2>{lang === "es" ? "Ciclo de vida de entregables" : "Deliverables lifecycle"}</h2>
        <p>
          {lang === "es"
            ? "Gestione versiones, revision, aprobacion, publicacion y exportacion del paquete final."
            : "Manage versions, review, approval, publication, and export for the final package."}
        </p>
      </header>

      <div className="deliverables-actions">
        {canManageDeliverables ? (
          <>
            <form
              action={async () => {
                "use server";
                await createOrRegenerateDeliverableAction();
              }}
            >
              <button type="submit" className="deliverable-button primary">
                {lang === "es" ? "Generar nueva version" : "Generate new version"}
              </button>
            </form>

            <form
              action={async () => {
                "use server";
                await refreshDeliverableReadinessAction();
              }}
            >
              <button type="submit" className="deliverable-button">
                {lang === "es" ? "Actualizar readiness" : "Refresh readiness"}
              </button>
            </form>
          </>
        ) : (
          <p className="phase-review-hint">
            {lang === "es"
              ? "Tu rol puede revisar este panel, pero no generar ni publicar versiones."
              : "Your role can review this panel, but cannot generate or publish versions."}
          </p>
        )}
      </div>

      <div className="deliverables-version-list">
        {versions.length === 0 ? (
          <p>
            {lang === "es"
              ? "Aun no hay versiones de entregables."
              : "No deliverable versions yet."}
          </p>
        ) : null}

        {versions.map((deliverable) => {
          const sourceRefs = parseSourcePhaseRefs(deliverable.sourcePhaseRefsJson);

          return (
            <article key={deliverable.id} className="deliverable-card">
              <h3>{deliverable.title}</h3>
              <p>
                {lang === "es" ? "Version" : "Version"} {deliverable.versionNumber} -{" "}
                {deliverable.status} - {deliverable.readinessStatus}
              </p>
              <div className="deliverable-actions-row">
                {deliverable.status === "draft" && canManageDeliverables ? (
                  <form
                    action={async () => {
                      "use server";
                      await submitDeliverableForReviewAction(deliverable.id);
                    }}
                  >
                    <button type="submit" className="deliverable-button">
                      {lang === "es" ? "Enviar a revision" : "Submit for review"}
                    </button>
                  </form>
                ) : null}

                {deliverable.status === "in_review" && canReviewDeliverables ? (
                  <form
                    action={async () => {
                      "use server";
                      await approveDeliverableAction(
                        deliverable.organizationId,
                        deliverable.id,
                      );
                    }}
                  >
                    <button type="submit" className="deliverable-button">
                      {lang === "es" ? "Aprobar version" : "Approve version"}
                    </button>
                  </form>
                ) : null}

                {deliverable.status === "approved" && canManageDeliverables ? (
                  <form
                    action={async () => {
                      "use server";
                      await publishDeliverableAction(deliverable.id);
                    }}
                  >
                    <button type="submit" className="deliverable-button">
                      {lang === "es" ? "Publicar" : "Publish"}
                    </button>
                  </form>
                ) : null}

                {["approved", "published"].includes(deliverable.status) ? (
                  <>
                    <form
                      action={async () => {
                        "use server";
                        await requestDeliverableExportAction({
                          deliverableId: deliverable.id,
                          format: "pdf",
                        });
                      }}
                    >
                      <button type="submit" className="deliverable-button">
                        {lang === "es" ? "Exportar PDF" : "Export PDF"}
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await requestDeliverableExportAction({
                          deliverableId: deliverable.id,
                          format: "docx",
                        });
                      }}
                    >
                      <button type="submit" className="deliverable-button">
                        {lang === "es" ? "Exportar DOCX" : "Export DOCX"}
                      </button>
                    </form>
                  </>
                ) : null}
              </div>

              {sourceRefs.length > 0 ? (
                <details className="deliverable-provenance">
                  <summary>
                    {lang === "es" ? "Ver trazabilidad de origen" : "View source provenance"}
                  </summary>
                  <ul className="deliverable-provenance-list">
                    {sourceRefs.map((ref) => (
                      <li key={`${deliverable.id}-${ref.phaseNumber}-${ref.phaseKey}`}>
                        {(lang === "es" ? "Fase" : "Phase") +
                          ` ${ref.phaseNumber} (${ref.phaseKey})`}{" "}
                        - {ref.completedOutputCount}/{ref.requiredOutputCount}{" "}
                        {lang === "es" ? "salidas" : "outputs"} - {ref.status}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      {latest ? (
        <p className="deliverables-latest">
          {lang === "es" ? "Ultima version activa" : "Latest active version"}:{" "}
          <strong>v{latest.versionNumber}</strong> ({latest.status})
        </p>
      ) : null}
    </section>
  );
}
