import { hasPermission, type UserSession } from "./auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "./audit";
import { AuthorizationError, requireOrganizationScope } from "./access-guards";
import { uploadFileToGoogleDriveWebhook } from "./google-drive-upload";
import { syncPhase1OutputsFromOnboarding } from "./phases";
import { prisma } from "./prisma";

export const MAX_ONBOARDING_EVIDENCE_BYTES = 5 * 1024 * 1024;

type Gate1Readiness = {
  isReady: boolean;
  criteria: {
    mouDocumentAvailable: boolean;
    organizationDocumentationAvailable: boolean;
  };
  missingCriteria: string[];
};

async function ensureWorkspace(organizationId: string) {
  return prisma.onboardingWorkspace.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

async function assertOnboardingWriteAccess(session: UserSession, organizationId: string) {
  if (!hasPermission(session.role, "canEditOrgData")) {
    await writeDeniedAccessEvent({
      session,
      organizationId,
      targetEntityType: "onboarding_workspace",
      reason: "onboarding_write_forbidden",
    });
    throw new AuthorizationError("Only NGO admins can edit onboarding data.", "ROLE_FORBIDDEN", 403);
  }

  await requireOrganizationScope({
    session,
    organizationId,
    action: "write",
    context: {
      reason: "onboarding_scope_forbidden",
      targetEntityType: "onboarding_workspace",
      targetEntityId: organizationId,
    },
  });
}

async function assertOnboardingConfigWriteAccess(session: UserSession, organizationId: string) {
  if (session.role === "facilitator") {
    await requireOrganizationScope({
      session,
      organizationId,
      action: "write",
      allowFacilitatorWrite: true,
      context: {
        reason: "onboarding_config_scope_forbidden",
        targetEntityType: "onboarding_workspace",
        targetEntityId: organizationId,
      },
    });
    return;
  }

  await writeDeniedAccessEvent({
    session,
    organizationId,
    targetEntityType: "onboarding_workspace",
    reason: "onboarding_config_write_forbidden",
  });
  throw new AuthorizationError(
    "Only facilitator can update onboarding links.",
    "ROLE_FORBIDDEN",
    403,
  );
}

function normalizeParticipantType(raw: string | null | undefined): "internal" | "external" {
  return raw === "external" ? "external" : "internal";
}

export async function getOnboardingWorkspace(input: {
  session: UserSession;
  organizationId: string;
}) {
  await requireOrganizationScope({
    session: input.session,
    organizationId: input.organizationId,
    action: "read",
    context: {
      reason: "onboarding_read_forbidden",
      targetEntityType: "onboarding_workspace",
      targetEntityId: input.organizationId,
    },
  });

  await ensureWorkspace(input.organizationId);
  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
  });
  const workspace = await prisma.onboardingWorkspace.findUniqueOrThrow({
    where: { organizationId: input.organizationId },
  });

  const evidence = await prisma.onboardingEvidence.findMany({
    where: { organizationId: input.organizationId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });

  const readiness = await getPhase1OnboardingReadiness(input.organizationId);
  return {
    workspace,
    evidence,
    readiness,
  };
}

export async function saveOnboardingWorkspace(input: {
  session: UserSession;
  organizationId: string;
  mouDocumentUrl: string;
  documentsFolderUrl: string;
}) {
  await assertOnboardingConfigWriteAccess(input.session, input.organizationId);

  const workspace = await prisma.onboardingWorkspace.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      mouDocumentUrl: input.mouDocumentUrl.trim() || null,
      documentsFolderUrl: input.documentsFolderUrl.trim() || null,
      updatedById: input.session.id,
    },
    update: {
      mouDocumentUrl: input.mouDocumentUrl.trim() || null,
      documentsFolderUrl: input.documentsFolderUrl.trim() || null,
      updatedById: input.session.id,
    },
  });

  await writeAuditEvent({
    eventKey: "onboarding.workspace.saved",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "onboarding_workspace",
    targetEntityId: workspace.id,
  });

  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
    completedById: input.session.id,
  });

  return workspace;
}

export async function addOnboardingParticipant(input: {
  session: UserSession;
  organizationId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  participantType?: string | null;
}) {
  await assertOnboardingWriteAccess(input.session, input.organizationId);
  const workspace = await ensureWorkspace(input.organizationId);
  const name = input.name.trim();
  if (name.length < 2) {
    throw new Error("Participant name must contain at least 2 characters.");
  }

  const last = await prisma.onboardingParticipant.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: [{ orderIndex: "desc" }],
    select: { orderIndex: true },
  });

  const participant = await prisma.onboardingParticipant.create({
    data: {
      workspaceId: workspace.id,
      organizationId: input.organizationId,
      name,
      title: input.title?.trim() || null,
      email: input.email?.trim() || null,
      participantType: normalizeParticipantType(input.participantType),
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });

  await writeAuditEvent({
    eventKey: "onboarding.participant.added",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "onboarding_participant",
    targetEntityId: participant.id,
  });

  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
    completedById: input.session.id,
  });

  return participant;
}

export async function removeOnboardingParticipant(input: {
  session: UserSession;
  organizationId: string;
  participantId: string;
}) {
  await assertOnboardingWriteAccess(input.session, input.organizationId);
  const participant = await prisma.onboardingParticipant.findUnique({
    where: { id: input.participantId },
    select: { id: true, organizationId: true },
  });
  if (!participant || participant.organizationId !== input.organizationId) {
    throw new Error("Participant not found.");
  }

  await prisma.onboardingParticipant.delete({ where: { id: participant.id } });
  await writeAuditEvent({
    eventKey: "onboarding.participant.removed",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "onboarding_participant",
    targetEntityId: participant.id,
  });

  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
    completedById: input.session.id,
  });
}

export async function uploadOnboardingEvidence(input: {
  session: UserSession;
  organizationId: string;
  file: File;
}) {
  await assertOnboardingWriteAccess(input.session, input.organizationId);
  const fileName = input.file.name.trim();
  if (fileName.length === 0) {
    throw new Error("File name is required.");
  }
  if (input.file.size <= 0) {
    throw new Error("File is empty.");
  }
  if (input.file.size > MAX_ONBOARDING_EVIDENCE_BYTES) {
    throw new Error("File is too large. Maximum allowed size is 5MB.");
  }

  const workspace = await ensureWorkspace(input.organizationId);
  const folderUrl = workspace.documentsFolderUrl?.trim() ?? "";
  if (folderUrl.length === 0) {
    throw new Error(
      "Configure the organization Google Drive folder link before uploading documentation.",
    );
  }

  const arrayBuffer = await input.file.arrayBuffer();
  const fileBytes = Buffer.from(arrayBuffer);
  const driveUpload = await uploadFileToGoogleDriveWebhook({
    organizationId: input.organizationId,
    folderUrl,
    fileName,
    mimeType: input.file.type || null,
    fileBytes,
  });
  if (driveUpload.skipped) {
    const reason =
      driveUpload.reason === "missing_webhook_url"
        ? "missing webhook URL"
        : "upload sync is disabled";
    throw new Error(`Google Drive upload is not configured (${reason}).`);
  }

  const evidence = await prisma.onboardingEvidence.create({
    data: {
      organizationId: input.organizationId,
      fileName,
      mimeType: input.file.type || null,
      fileSizeBytes: input.file.size,
      fileBytes,
      uploadedById: input.session.id,
    },
  });

  await writeAuditEvent({
    eventKey: "onboarding.evidence.uploaded",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "onboarding_evidence",
    targetEntityId: evidence.id,
    metadata: {
      fileName,
      mimeType: input.file.type || null,
      fileSizeBytes: input.file.size,
      documentsFolderUrl: folderUrl,
      driveFileId: driveUpload.driveFileId ?? null,
      driveFileUrl: driveUpload.driveFileUrl ?? null,
    },
  });

  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
    completedById: input.session.id,
  });

  return evidence;
}

export async function deleteOnboardingEvidence(input: {
  session: UserSession;
  organizationId: string;
  evidenceId: string;
}) {
  await assertOnboardingWriteAccess(input.session, input.organizationId);
  const evidence = await prisma.onboardingEvidence.findUnique({
    where: { id: input.evidenceId },
    select: { id: true, organizationId: true },
  });
  if (!evidence || evidence.organizationId !== input.organizationId) {
    throw new Error("Evidence not found.");
  }

  await prisma.onboardingEvidence.delete({ where: { id: evidence.id } });
  await writeAuditEvent({
    eventKey: "onboarding.evidence.deleted",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "onboarding_evidence",
    targetEntityId: evidence.id,
  });

  await syncPhase1OutputsFromOnboarding({
    organizationId: input.organizationId,
    completedById: input.session.id,
  });
}

function buildGateMissingCriteria(input: {
  mouDocumentAvailable: boolean;
  organizationDocumentationAvailable: boolean;
}) {
  const missing: string[] = [];
  if (!input.mouDocumentAvailable) {
    missing.push("memorandum_of_understanding");
  }
  if (!input.organizationDocumentationAvailable) {
    missing.push("organization_documentation");
  }
  return missing;
}

export async function getPhase1OnboardingReadiness(organizationId: string): Promise<Gate1Readiness> {
  const [workspace, evidenceCount] = await Promise.all([
    prisma.onboardingWorkspace.findUnique({
      where: { organizationId },
      select: { mouDocumentUrl: true },
    }),
    prisma.onboardingEvidence.count({
      where: { organizationId },
    }),
  ]);

  const mouDocumentAvailable = Boolean(workspace?.mouDocumentUrl?.trim());
  const organizationDocumentationAvailable = evidenceCount > 0;

  const missingCriteria = buildGateMissingCriteria({
    mouDocumentAvailable,
    organizationDocumentationAvailable,
  });

  return {
    isReady: missingCriteria.length === 0,
    criteria: {
      mouDocumentAvailable,
      organizationDocumentationAvailable,
    },
    missingCriteria,
  };
}
