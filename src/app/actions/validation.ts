"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  addValidationSignature,
  deleteValidationSignature,
  saveValidationFeedback,
  type ValidationMutationResult,
} from "@/lib/validation-mutations";

type ValidationActionResponse = ValidationMutationResult;

/**
 * Saves the NGO's formal response to the Facilitator's Phase 4 feedback.
 */
export async function saveValidationFeedbackAction(
  organizationId: string,
  response: string
): Promise<ValidationActionResponse> {
  const session = await getSession();
  const result = await saveValidationFeedback({ session, organizationId, response });
  if (result.success) {
    revalidatePath(`/[lang]/phases/5`);
  }
  return result;
}

/**
 * Adds an official validation signature for the organization's plan.
 */
export async function addValidationSignatureAction(
  organizationId: string,
  signerName: string,
  signerRole: string
): Promise<ValidationActionResponse> {
  const session = await getSession();
  const result = await addValidationSignature({
    session,
    organizationId,
    signerName,
    signerRole,
  });
  if (result.success) {
    revalidatePath(`/[lang]/phases/5`);
  }
  return result;
}

/**
 * Deletes a validation signature.
 */
export async function deleteValidationSignatureAction(
  organizationId: string,
  signatureId: string
): Promise<ValidationActionResponse> {
  const session = await getSession();
  const result = await deleteValidationSignature({
    session,
    organizationId,
    signatureId,
  });
  if (result.success) {
    revalidatePath(`/[lang]/phases/5`);
  }
  return result;
}
