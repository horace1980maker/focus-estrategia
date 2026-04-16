"use server";

import { revalidatePath } from "next/cache";
import { deleteOnboardingEvidence, saveOnboardingWorkspace } from "@/lib/onboarding-service";
import { getSession } from "@/lib/session";

type ActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

function revalidateOnboardingPaths(phaseNumber = 1) {
  for (const lang of ["es", "en"] as const) {
    revalidatePath(`/${lang}/phases/${phaseNumber}`);
    revalidatePath(`/${lang}/dashboard`);
    revalidatePath(`/${lang}/cohort`);
  }
}

export async function saveOnboardingWorkspaceAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    await saveOnboardingWorkspace({
      session,
      organizationId,
      mouDocumentUrl: String(formData.get("mouDocumentUrl") ?? ""),
      documentsFolderUrl: String(formData.get("documentsFolderUrl") ?? ""),
    });

    revalidateOnboardingPaths(1);
    return { success: true, message: "Onboarding links saved." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save onboarding links.",
    };
  }
}

export async function deleteOnboardingEvidenceAction(
  organizationId: string,
  evidenceId: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    await deleteOnboardingEvidence({
      session,
      organizationId,
      evidenceId,
    });

    revalidateOnboardingPaths(1);
    return { success: true, message: "Documentation removed." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete documentation.",
    };
  }
}
