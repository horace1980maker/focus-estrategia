"use server";

import { revalidatePath } from "next/cache";
import {
  parseDiagnosisFormAnswers,
  submitDiagnosisSurveyResponse,
} from "@/lib/diagnosis-survey";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { getSession } from "@/lib/session";

type DiagnosisActionResult =
  | { success: true; message: string; data?: Record<string, unknown> }
  | { success: false; error: string; data?: Record<string, unknown> };

export async function submitDiagnosisSurveyAction(formData: FormData): Promise<DiagnosisActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_submit_missing_org_context",
      });
      return { success: false, error: "No organization context found for current user." };
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_submit_forbidden",
      });
      return { success: false, error: "Only NGO admins can submit diagnosis responses." };
    }

    const answers = await parseDiagnosisFormAnswers(formData);
    const result = await submitDiagnosisSurveyResponse({
      organizationId: session.organizationId,
      submittedById: session.id,
      answers,
    });
    await writeAuditEvent({
      eventKey: "diagnosis.survey.submitted",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "diagnosis_survey_response",
      targetEntityId: String(result.responseId),
    });

    revalidatePath(`/es/phases/2`);
    revalidatePath(`/en/phases/2`);
    revalidatePath(`/es/dashboard`);
    revalidatePath(`/en/dashboard`);

    return {
      success: true,
      message: "Diagnosis survey submitted successfully.",
      data: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit diagnosis survey.";
    return { success: false, error: message };
  }
}
