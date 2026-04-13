import { saveValidationFeedbackAction, addValidationSignatureAction, deleteValidationSignatureAction } from "@/app/actions/validation";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { prisma } from "@/lib/prisma";
import { syncValidationOutputCompletion } from "@/lib/validation-readiness-sync";

interface ValidationPanelProps {
  organizationId: string;
  isEditable: boolean; // false for facilitators and coordinators
  lang: Locale;
}

export default async function ValidationPanel({
  organizationId,
  isEditable,
  lang,
}: ValidationPanelProps) {
  const dict = await getDictionary(lang);
  const copy = dict.validation;

  // Find the latest approved Phase 4 review to show as context.
  const phase4Review = await prisma.phaseReview.findFirst({
    where: {
      phase: {
        phaseNumber: 4,
        phaseTracker: { organizationId },
      },
      decision: "approved",
    },
    orderBy: { createdAt: "desc" },
    include: { reviewer: true },
  });

  const feedbackResponse = await prisma.validationFeedbackResponse.findUnique({
    where: { organizationId },
    include: { submittedBy: true },
  });

  const signatures = await prisma.validationSignoff.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { signedBy: true },
  });

  const readiness = await syncValidationOutputCompletion(organizationId);
  const isFullyValidated = readiness.isValidatedPlanComplete;

  async function handleFeedbackSubmit(formData: FormData) {
    "use server";
    const response = String(formData.get("response") ?? "");
    if (!response.trim()) return;
    await saveValidationFeedbackAction(organizationId, response);
  }

  async function handleSignatureSubmit(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "");
    const role = String(formData.get("role") ?? "");
    if (!name.trim() || !role.trim()) return;
    await addValidationSignatureAction(organizationId, name, role);
  }

  async function handleSignatureDelete(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteValidationSignatureAction(organizationId, id);
  }

  return (
    <section className="validation-panel" id="validation">
      <header className="validation-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>

        <div className="validation-progress">
          <div className="validation-progress-text">{readiness.progressPercentage}%</div>
          <div className="validation-progress-bar">
            <div
              className="validation-progress-fill"
              style={{ width: `${readiness.progressPercentage}%` }}
            />
          </div>
        </div>
      </header>

      {readiness.progressPercentage === 100 ? (
        <div className="validation-success-banner">
          <h3>{copy.validated_banner_title}</h3>
          <p>{copy.validated_banner_description}</p>
        </div>
      ) : null}

      {!isEditable ? (
        <p className="validation-readonly-notice">{copy.readonly_notice}</p>
      ) : null}

      <div className="validation-section">
        <h3>1. {copy.section_review_title}</h3>

        <div>
          <p className="validation-section-desc mb-2">{copy.section_review_caption}</p>
          {phase4Review ? (
            <blockquote className="validation-quote">
              "{phase4Review.feedback || copy.approval_without_comments}"
              <footer>- {phase4Review.reviewer.name}</footer>
            </blockquote>
          ) : (
            <p className="validation-section-desc italic">{copy.no_approval_review_found}</p>
          )}
        </div>

        <form action={handleFeedbackSubmit} className="validation-form mt-4">
          <label className="validation-sig-name">{copy.organization_response_label}</label>
          <textarea
            name="response"
            disabled={!isEditable || isFullyValidated}
            defaultValue={feedbackResponse?.response || ""}
            placeholder={copy.organization_response_placeholder}
          />
          {isEditable && !isFullyValidated ? (
            <button type="submit">{copy.save_response}</button>
          ) : null}
        </form>
      </div>

      <div className="validation-section">
        <h3>2. {copy.section_signoff_title}</h3>
        <p className="validation-section-desc">{copy.section_signoff_description}</p>

        <div className="validation-sig-grid">
          {signatures.map((sig) => (
            <div key={sig.id} className="validation-sig-card">
              <div className="validation-sig-info">
                <span className="validation-sig-name">{sig.signerName}</span>
                <span className="validation-sig-role">{sig.signerRole}</span>
                <span className="validation-sig-by">
                  {copy.entered_by} {sig.signedBy?.name}
                </span>
              </div>
              {isEditable && !isFullyValidated ? (
                <form action={handleSignatureDelete}>
                  <input type="hidden" name="id" value={sig.id} />
                  <button type="submit" className="danger">
                    {copy.delete}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>

        {isEditable && !isFullyValidated ? (
          <div className="validation-add-signature">
            <p className="validation-sig-name mb-3">{copy.add_signature_title}</p>
            <form action={handleSignatureSubmit} className="validation-form">
              <input type="text" name="name" placeholder={copy.name_placeholder} required />
              <input type="text" name="role" placeholder={copy.role_placeholder} required />
              <div>
                <button type="submit">{copy.add_signature}</button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
