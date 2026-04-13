import Link from "next/link";
import { requestReviewAction } from "@/app/actions/phases";
import { approvePhaseAction, rejectPhaseAction } from "@/app/actions/phases";
import { setPhaseOutputCompletionAction } from "@/app/actions/phases";
import type { Locale } from "@/i18n/config";
import { getPhaseDescription } from "@/lib/phase-metadata";
import { prisma } from "@/lib/prisma";
import {
  getPhaseGateMessage,
  getPhaseStatusLabel,
  getWorkspaceStateHint,
} from "@/lib/phase-workspace-copy";
import { getPhaseOutputStatus, getTotalPhases } from "@/lib/phases";
import { getDictionary } from "@/i18n/get-dictionary";

type PhaseWorkspaceShellProps = {
  lang: Locale;
  organizationId: string;
  phaseNumber: number;
  phaseName: string;
  phaseStatus: string;
  currentPhase: number;
  canEditOutputs: boolean;
  canApprovePhases: boolean;
  activeRole: string;
  pendingReviewItems?: Array<{
    organizationId: string;
    organizationName: string;
    phaseNumber: number;
  }>;
};

export default async function PhaseWorkspaceShell(props: PhaseWorkspaceShellProps) {
  const dict = await getDictionary(props.lang);
  const totalPhases = getTotalPhases();
  const summary = await getPhaseOutputStatus(props.organizationId, props.phaseNumber);
  const missingCount = summary.missingOutputs.length;
  const canEditPhaseOutputs = props.canEditOutputs && props.phaseStatus !== "approved";
  const nextPhaseNumber =
    props.phaseNumber < totalPhases ? props.phaseNumber + 1 : null;
  const canRequestReview = props.canEditOutputs && props.phaseStatus === "in_progress";
  const isReviewRequested = props.phaseStatus === "review_requested";
  const canApproveReview = props.canApprovePhases && isReviewRequested;
  const requestReviewDisabled = missingCount > 0;
  const latestReview = props.canEditOutputs
    ? await prisma.phaseReview.findFirst({
        where: {
          phase: {
            phaseNumber: props.phaseNumber,
            phaseTracker: {
              organizationId: props.organizationId,
            },
          },
        },
        include: {
          reviewer: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const reviewIsApproved = latestReview?.decision === "approved";
  const fallbackApprovedFeedback =
    props.lang === "es"
      ? "Fase aprobada. Buen trabajo, puedes continuar con la siguiente fase."
      : "Phase approved. Great work, you can continue to the next phase.";
  const fallbackRejectedFeedback =
    props.lang === "es"
      ? "La fase fue devuelta con ajustes requeridos. Actualiza las salidas y vuelve a solicitar revision."
      : "This phase was returned with required adjustments. Update the outputs and request review again.";
  const feedbackText =
    latestReview?.feedback?.trim() ||
    (latestReview ? (reviewIsApproved ? fallbackApprovedFeedback : fallbackRejectedFeedback) : null);
  const reviewDateLabel = latestReview
    ? new Intl.DateTimeFormat(props.lang === "es" ? "es-GT" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(latestReview.createdAt)
    : null;

  return (
    <section className="phase-workspace-shell">
      <header className="phase-workspace-header">
        <p className="phase-workspace-eyebrow">
          {props.lang === "es" ? "Espacio de trabajo de fase" : "Phase workspace"}
        </p>
        <h1>
          {props.phaseName} · {props.lang === "es" ? "Fase" : "Phase"}{" "}
          {props.phaseNumber}/{totalPhases}
        </h1>
        <p>{getPhaseDescription(props.phaseNumber, props.lang)}</p>
        <p className="phase-workspace-eyebrow">
          {props.lang === "es" ? "Rol activo" : "Active role"}: {props.activeRole}
        </p>
      </header>

      <div className="phase-workspace-status" id="phase-status">
        <div className="phase-status-card">
          <div className="phase-status-label">{props.lang === "es" ? "Estado" : "Status"}</div>
          <div className="phase-status-value">
            {getPhaseStatusLabel(props.lang, props.phaseStatus)}
          </div>
        </div>
        <div className="phase-status-card">
          <div className="phase-status-label">
            {props.lang === "es" ? "Salidas requeridas" : "Required outputs"}
          </div>
          <div className="phase-status-value">
            {summary.completedCount}/{summary.requiredCount}
          </div>
        </div>
        <div className="phase-status-card">
          <div className="phase-status-label">
            {props.lang === "es"
              ? "Salidas requeridas pendientes"
              : "Pending required outputs"}
          </div>
          <div className="phase-status-value">{missingCount}</div>
        </div>
      </div>

      <div className="phase-output-grid">
        {summary.outputs.map((output) => {
          const nextCompletedState = !output.isCompleted;
          const buttonText = output.isCompleted
            ? props.lang === "es"
              ? "Marcar pendiente"
              : "Mark pending"
            : props.lang === "es"
              ? "Marcar completo"
              : "Mark complete";

          return (
            <article key={output.outputKey} className="phase-output-card">
              <h3>{dict.outputs?.[output.outputKey as keyof typeof dict.outputs] ?? output.outputLabel}</h3>
              <p className="phase-output-key">{output.outputKey}</p>
              <p className={`phase-output-state ${output.isCompleted ? "done" : "todo"}`}>
                {output.isCompleted
                  ? props.lang === "es"
                    ? "Completado"
                    : "Completed"
                  : props.lang === "es"
                    ? "Pendiente"
                    : "Pending"}
              </p>

              {canEditPhaseOutputs ? (
                <form
                  action={async () => {
                    "use server";
                    await setPhaseOutputCompletionAction({
                      organizationId: props.organizationId,
                      phaseNumber: props.phaseNumber,
                      outputKey: output.outputKey,
                      isCompleted: nextCompletedState,
                    });
                  }}
                >
                  <button type="submit" className="phase-output-toggle">
                    {buttonText}
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>

      {props.canEditOutputs && latestReview && feedbackText ? (
        <section className={`phase-feedback-card ${reviewIsApproved ? "approved" : "rejected"}`}>
          <div className="phase-feedback-header">
            <p className="phase-workspace-eyebrow">
              {props.lang === "es" ? "Retroalimentacion del facilitador" : "Facilitator feedback"}
            </p>
            <span className={`phase-feedback-badge ${reviewIsApproved ? "approved" : "rejected"}`}>
              {reviewIsApproved
                ? props.lang === "es"
                  ? "Aprobada"
                  : "Approved"
                : props.lang === "es"
                  ? "Devuelta con ajustes"
                  : "Returned for changes"}
            </span>
          </div>
          <p className="phase-feedback-body">{feedbackText}</p>
          <p className="phase-feedback-meta">
            {props.lang === "es"
              ? `Por ${latestReview.reviewer.name} • ${reviewDateLabel}`
              : `By ${latestReview.reviewer.name} • ${reviewDateLabel}`}
          </p>
        </section>
      ) : null}

      <footer className="phase-workspace-footer" id="phase-controls">
        {missingCount > 0 ? (
          <p className="phase-gate-warning">
            {getPhaseGateMessage(props.lang, missingCount)}
          </p>
        ) : (
          <p className="phase-gate-ready">{getPhaseGateMessage(props.lang, missingCount)}</p>
        )}

        {canRequestReview ? (
          <form
            action={async () => {
              "use server";
              await requestReviewAction(props.organizationId, props.phaseNumber);
            }}
            className="phase-review-form"
          >
            <button
              type="submit"
              className="phase-review-button"
              disabled={requestReviewDisabled}
            >
              {props.lang === "es" ? "Solicitar revision" : "Request review"}
            </button>
            <p className="phase-review-hint">
              {requestReviewDisabled
                ? props.lang === "es"
                  ? "Completa todas las salidas requeridas para habilitar la revision."
                  : "Complete all required outputs to enable review request."
                : props.lang === "es"
                  ? "La fase esta lista para revision del facilitador."
                  : "This phase is ready for facilitator review."}
            </p>
          </form>
        ) : null}

        {props.canEditOutputs && props.phaseStatus === "approved" ? (
          <p className="phase-review-hint">
            {getWorkspaceStateHint(props.lang, "approved")}
          </p>
        ) : null}

        {props.canEditOutputs && props.phaseStatus !== "in_progress" && props.phaseStatus !== "review_requested" ? (
          <p className="phase-review-hint">
            {getWorkspaceStateHint(props.lang, "blocked")}
          </p>
        ) : null}

        {isReviewRequested ? (
          <p className="phase-review-pending">
            {getWorkspaceStateHint(props.lang, "pending_review")}
          </p>
        ) : null}

        {props.canApprovePhases && !isReviewRequested ? (
          <p className="phase-review-hint">
            {props.lang === "es"
              ? "Controles de facilitador disponibles cuando la organizacion solicite revision de esta fase."
              : "Facilitator controls become available once the organization requests review for this phase."}
          </p>
        ) : null}

        {props.canApprovePhases ? (
          <div className="phase-facilitator-actions">
            <p className="phase-review-hint">
              {props.lang === "es"
                ? "Solicitudes pendientes en organizaciones:"
                : "Pending requests across organizations:"}
            </p>
            {props.pendingReviewItems && props.pendingReviewItems.length > 0 ? (
              <div className="deliverables-actions">
                {props.pendingReviewItems.map((item) => (
                  <Link
                    key={`${item.organizationId}-${item.phaseNumber}`}
                    href={`/${props.lang}/phases/${item.phaseNumber}?org=${encodeURIComponent(item.organizationId)}`}
                    className="phase-next-link"
                  >
                    {props.lang === "es"
                      ? `${item.organizationName} · Fase ${item.phaseNumber}`
                      : `${item.organizationName} · Phase ${item.phaseNumber}`}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="phase-review-hint">
                {props.lang === "es"
                  ? "No hay fases en revision solicitada en este momento."
                  : "No phases are currently in review requested status."}
              </p>
            )}
          </div>
        ) : null}

        {!props.canEditOutputs && !props.canApprovePhases ? (
          <p className="phase-review-hint">
            {getWorkspaceStateHint(props.lang, "role_restricted")}
          </p>
        ) : null}

        {canApproveReview ? (
          <div className="phase-facilitator-actions">
            <form
              action={async (formData: FormData) => {
                "use server";
                const feedback = String(formData.get("approvalFeedback") ?? "").trim();
                await approvePhaseAction(
                  props.organizationId,
                  props.phaseNumber,
                  feedback.length > 0 ? feedback : undefined,
                );
              }}
              className="phase-review-form"
            >
              <label htmlFor={`approve-feedback-${props.phaseNumber}`}>
                {props.lang === "es"
                  ? "Retroalimentacion de aprobacion (opcional)"
                  : "Approval feedback (optional)"}
              </label>
              <textarea
                id={`approve-feedback-${props.phaseNumber}`}
                name="approvalFeedback"
                rows={2}
                placeholder={
                  props.lang === "es"
                    ? "Ejemplo: Excelente avance, continua con este nivel de evidencia."
                    : "Example: Great progress, keep this level of evidence quality."
                }
              />
              <button type="submit" className="phase-review-button">
                {props.lang === "es" ? "Aprobar fase" : "Approve phase"}
              </button>
            </form>

            <form
              action={async (formData: FormData) => {
                "use server";
                const feedback = String(formData.get("feedback") ?? "");
                await rejectPhaseAction(
                  props.organizationId,
                  props.phaseNumber,
                  feedback,
                );
              }}
              className="phase-review-form"
            >
              <label htmlFor={`reject-feedback-${props.phaseNumber}`}>
                {props.lang === "es"
                  ? "Retroalimentacion para devolucion"
                  : "Feedback for rejection"}
              </label>
              <textarea
                id={`reject-feedback-${props.phaseNumber}`}
                name="feedback"
                rows={3}
                required
                placeholder={
                  props.lang === "es"
                    ? "Describe ajustes requeridos antes de aprobar."
                    : "Describe required adjustments before approval."
                }
              />
              <button type="submit" className="phase-output-toggle">
                {props.lang === "es" ? "Rechazar fase" : "Reject phase"}
              </button>
            </form>
          </div>
        ) : null}

        {nextPhaseNumber ? (
          <Link
            href={`/${props.lang}/phases/${nextPhaseNumber}?org=${encodeURIComponent(props.organizationId)}`}
            className="phase-next-link"
          >
            {props.lang === "es" ? "Ir a la siguiente fase" : "Go to next phase"}
          </Link>
        ) : null}
      </footer>
    </section>
  );
}
