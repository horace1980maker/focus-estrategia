import type { UserSession } from "./auth";
import { prisma } from "./prisma";
import { evaluateValidationMutationAccess } from "./validation-access";
import { syncValidationOutputCompletion } from "./validation-readiness-sync";

export type ValidationMutationResult = {
  success: boolean;
  error?: string;
};

type ValidationMutationInput = {
  session: Pick<UserSession, "id" | "role" | "organizationId">;
  organizationId: string;
};

function getValidationAccessErrorMessage(
  reason: "permission_denied" | "organization_scope_denied" | "validation_locked",
): string {
  switch (reason) {
    case "permission_denied":
      return "Unauthorized: Missing permission.";
    case "organization_scope_denied":
      return "Unauthorized: Invalid organization.";
    case "validation_locked":
      return "Validation is locked after the plan has been marked as validated.";
    default:
      return "Unauthorized.";
  }
}

async function isValidationLocked(organizationId: string): Promise<boolean> {
  const readiness = await syncValidationOutputCompletion(organizationId);
  return readiness.isValidatedPlanComplete;
}

async function assertValidationMutationAccess(
  input: ValidationMutationInput,
): Promise<ValidationMutationResult | null> {
  const access = evaluateValidationMutationAccess({
    role: input.session.role,
    sessionOrganizationId: input.session.organizationId,
    targetOrganizationId: input.organizationId,
    isLocked: await isValidationLocked(input.organizationId),
  });

  if (access.allowed) {
    return null;
  }

  return {
    success: false,
    error: getValidationAccessErrorMessage(access.reason),
  };
}

export async function saveValidationFeedback(input: ValidationMutationInput & { response: string }) {
  try {
    const denied = await assertValidationMutationAccess(input);
    if (denied) {
      return denied;
    }

    await prisma.validationFeedbackResponse.upsert({
      where: { organizationId: input.organizationId },
      update: {
        response: input.response,
        submittedById: input.session.id,
      },
      create: {
        organizationId: input.organizationId,
        response: input.response,
        submittedById: input.session.id,
      },
    });

    await syncValidationOutputCompletion(input.organizationId);

    return { success: true } satisfies ValidationMutationResult;
  } catch (error) {
    console.error("[saveValidationFeedback] Error:", error);
    return { success: false, error: "Failed to save validation feedback." };
  }
}

export async function addValidationSignature(
  input: ValidationMutationInput & { signerName: string; signerRole: string },
) {
  try {
    const denied = await assertValidationMutationAccess(input);
    if (denied) {
      return denied;
    }

    await prisma.validationSignoff.create({
      data: {
        organizationId: input.organizationId,
        signerName: input.signerName,
        signerRole: input.signerRole,
        signedById: input.session.id,
      },
    });

    await syncValidationOutputCompletion(input.organizationId);

    return { success: true } satisfies ValidationMutationResult;
  } catch (error) {
    console.error("[addValidationSignature] Error:", error);
    return { success: false, error: "Failed to add validation signature." };
  }
}

export async function deleteValidationSignature(
  input: ValidationMutationInput & { signatureId: string },
) {
  try {
    const denied = await assertValidationMutationAccess(input);
    if (denied) {
      return denied;
    }

    await prisma.validationSignoff.deleteMany({
      where: {
        id: input.signatureId,
        organizationId: input.organizationId,
      },
    });

    await syncValidationOutputCompletion(input.organizationId);

    return { success: true } satisfies ValidationMutationResult;
  } catch (error) {
    console.error("[deleteValidationSignature] Error:", error);
    return { success: false, error: "Failed to delete validation signature." };
  }
}
