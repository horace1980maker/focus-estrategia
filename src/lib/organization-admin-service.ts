import { prisma } from "./prisma";
import { ROLES, type UserSession } from "./auth";
import { writeAuditEvent } from "./audit";
import { TOTAL_PHASES, phaseNumberToKey } from "./phase-model";
import { requireRole } from "./access-guards";

export const ORGANIZATION_RESET_CONFIRMATION = "RESET";

export class OrganizationAdminServiceError extends Error {
  status: 400 | 403 | 404 | 409;
  code: string;

  constructor(
    message: string,
    code: string,
    status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildBaselinePhases(now: Date) {
  return Array.from({ length: TOTAL_PHASES }, (_, index) => {
    const phaseNumber = index + 1;
    return {
      phaseNumber,
      phaseKey: phaseNumberToKey(phaseNumber) ?? "onboarding",
      status: phaseNumber === 1 ? "in_progress" : "locked",
      startedAt: phaseNumber === 1 ? now : null,
    };
  });
}

function normalizeNullableText(input: string | null | undefined): string | null {
  const normalized = input?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function isPrismaTimeoutError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    (error as { code?: string }).code === "P1008"
  ) {
    return true;
  }
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    return (error as { message: string }).message.includes("Operation has timed out");
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function deleteByIdsInChunks(
  ids: string[],
  deleter: (chunkIds: string[]) => Promise<unknown>,
  chunkSize = 250,
) {
  if (ids.length === 0) {
    return;
  }
  for (const chunkIds of chunkArray(ids, chunkSize)) {
    await runWithTimeoutRetry(() => deleter(chunkIds));
  }
}

async function runWithTimeoutRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isPrismaTimeoutError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delayMs = Math.min(3000, 250 * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }

  throw new Error("Operation failed after timeout retries.");
}

async function deleteAuthSessionsForOrganization(
  organizationId: string,
  options?: {
    preserveAuthSessionId?: string | null;
    preserveUserId?: string | null;
  },
) {
  await runWithTimeoutRetry(async () => {
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const preserveAuthSessionId = options?.preserveAuthSessionId ?? null;
    const preserveUserId = options?.preserveUserId ?? null;
    const userIds = users
      .map((user) => user.id)
      .filter((userId) => userId !== preserveUserId);

    const byOrganizationContextWhere: {
      organizationContextId: string;
      NOT?: { id: string };
    } = { organizationContextId: organizationId };
    if (preserveAuthSessionId) {
      byOrganizationContextWhere.NOT = { id: preserveAuthSessionId };
    }
    await prisma.authSession.deleteMany({
      where: byOrganizationContextWhere,
    });
    if (userIds.length > 0) {
      for (const userIdChunk of chunkArray(userIds, 250)) {
        const byUserWhere: {
          userId: { in: string[] };
          NOT?: { id: string };
        } = {
          userId: { in: userIdChunk },
        };
        if (preserveAuthSessionId) {
          byUserWhere.NOT = { id: preserveAuthSessionId };
        }
        await prisma.authSession.deleteMany({
          where: byUserWhere,
        });
      }
    }
  });
}

async function assertFacilitatorActor(actor: UserSession, reason: string) {
  await requireRole({
    session: actor,
    roles: [ROLES.FACILITATOR],
    context: {
      reason,
      targetEntityType: "organization",
    },
  });
}

export async function createOrganizationAsFacilitator(input: {
  actor: UserSession;
  name: string;
  country?: string | null;
  description?: string | null;
}) {
  await assertFacilitatorActor(input.actor, "facilitator_org_create_forbidden");

  const name = normalizeName(input.name);
  const country = normalizeNullableText(input.country);
  const description = normalizeNullableText(input.description);

  if (name.length < 3) {
    throw new OrganizationAdminServiceError(
      "Organization name must contain at least 3 characters.",
      "ORG_NAME_INVALID",
      400,
    );
  }

  const allNames = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  const duplicate = allNames.find(
    (organization) => organization.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    throw new OrganizationAdminServiceError(
      "Organization already exists.",
      "ORG_EXISTS",
      409,
    );
  }

  const now = new Date();
  const organization = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name,
        country,
        description,
      },
    });

    await tx.phaseTracker.create({
      data: {
        organizationId: created.id,
        currentPhase: 1,
        phases: {
          create: buildBaselinePhases(now),
        },
      },
    });

    return created;
  });

  await writeAuditEvent({
    eventKey: "organization.admin.created",
    eventType: "ops",
    actorId: input.actor.id,
    actorRole: input.actor.role,
    organizationId: organization.id,
    targetEntityType: "organization",
    targetEntityId: organization.id,
    metadata: {
      name: organization.name,
      country: organization.country,
      source: "facilitator_dashboard",
    },
  });

  return organization;
}

export async function resetOrganizationContentAsFacilitator(input: {
  actor: UserSession;
  organizationId: string;
  confirmationText: string;
}) {
  await assertFacilitatorActor(input.actor, "facilitator_org_reset_forbidden");

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new OrganizationAdminServiceError(
      "Organization not found.",
      "ORG_NOT_FOUND",
      404,
    );
  }

  if (input.confirmationText.trim().toUpperCase() !== ORGANIZATION_RESET_CONFIRMATION) {
    throw new OrganizationAdminServiceError(
      `Type "${ORGANIZATION_RESET_CONFIRMATION}" to confirm reset.`,
      "RESET_CONFIRMATION_INVALID",
      400,
    );
  }

  const preserveAuthSessionId = input.actor.authSessionId ?? null;
  await deleteAuthSessionsForOrganization(organization.id, {
    preserveAuthSessionId,
    preserveUserId: input.actor.id,
  });

  const now = new Date();
  const [surveyResponseRows, theoryRows] = await Promise.all([
    runWithTimeoutRetry(() =>
      prisma.diagnosisSurveyResponse.findMany({
        where: { organizationId: organization.id },
        select: { id: true },
      }),
    ),
    runWithTimeoutRetry(() =>
      prisma.theoryOfChange.findMany({
        where: { organizationId: organization.id },
        select: { id: true },
      }),
    ),
  ]);
  const surveyResponseIds = surveyResponseRows.map((row) => row.id);
  const theoryOfChangeIds = theoryRows.map((row) => row.id);

  await deleteByIdsInChunks(
    surveyResponseIds,
    (chunkIds) =>
      prisma.diagnosisSurveyAnswer.deleteMany({
        where: { responseId: { in: chunkIds } },
      }),
  );
  await runWithTimeoutRetry(() =>
    prisma.diagnosisSurveyResponse.deleteMany({
      where: { organizationId: organization.id },
    }),
  );

  await deleteByIdsInChunks(
    theoryOfChangeIds,
    (chunkIds) =>
      prisma.outcome.deleteMany({
        where: { theoryOfChangeId: { in: chunkIds } },
      }),
  );
  await deleteByIdsInChunks(
    theoryOfChangeIds,
    (chunkIds) =>
      prisma.pathway.deleteMany({
        where: { theoryOfChangeId: { in: chunkIds } },
      }),
  );

  await runWithTimeoutRetry(() =>
    prisma.validationSignoff.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.validationFeedbackResponse.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.draftSnapshot.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.draftAssumptionRisk.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.draftLineOfAction.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.draftObjectiveResult.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.deliverable.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.diagnosticFinding.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.strategicObjective.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.theoryOfChange.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.phaseMigrationAudit.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  while (true) {
    const activityRows = await runWithTimeoutRetry(() =>
      prisma.activitySession.findMany({
        where: { organizationId: organization.id },
        select: { id: true },
        take: 250,
      }),
    );
    if (activityRows.length === 0) {
      break;
    }
    await deleteByIdsInChunks(
      activityRows.map((row) => row.id),
      (chunkIds) =>
        prisma.activitySession.deleteMany({
          where: { id: { in: chunkIds } },
        }),
    );
    if (activityRows.length < 250) {
      break;
    }
  }
  while (true) {
    const engagementRows = await runWithTimeoutRetry(() =>
      prisma.sectionEngagement.findMany({
        where: { organizationId: organization.id },
        select: { id: true },
        take: 250,
      }),
    );
    if (engagementRows.length === 0) {
      break;
    }
    await deleteByIdsInChunks(
      engagementRows.map((row) => row.id),
      (chunkIds) =>
        prisma.sectionEngagement.deleteMany({
          where: { id: { in: chunkIds } },
        }),
    );
    if (engagementRows.length < 250) {
      break;
    }
  }
  await runWithTimeoutRetry(() =>
    prisma.roiSnapshot.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.roiBenchmarkChange.deleteMany({
      where: { organizationId: organization.id },
    }),
  );
  await runWithTimeoutRetry(() =>
    prisma.roiSetting.deleteMany({
      where: { organizationId: organization.id },
    }),
  );

  await runWithTimeoutRetry(() =>
    prisma.organization.update({
      where: { id: organization.id },
      data: {
        country: null,
        description: null,
        logoUrl: null,
      },
    }),
  );

  const tracker = await runWithTimeoutRetry(() =>
    prisma.phaseTracker.findUnique({
      where: { organizationId: organization.id },
      select: {
        id: true,
        phases: {
          select: { id: true },
        },
      },
    }),
  );
  const phaseIds = tracker?.phases.map((phase) => phase.id) ?? [];
  await deleteByIdsInChunks(
    phaseIds,
    (chunkIds) =>
      prisma.phaseOutputCompletion.deleteMany({
        where: { phaseId: { in: chunkIds } },
      }),
  );
  await deleteByIdsInChunks(
    phaseIds,
    (chunkIds) =>
      prisma.phaseReview.deleteMany({
        where: { phaseId: { in: chunkIds } },
      }),
  );
  await deleteByIdsInChunks(
    phaseIds,
    (chunkIds) =>
      prisma.phase.deleteMany({
        where: { id: { in: chunkIds } },
      }),
  );

  if (tracker?.id) {
    await runWithTimeoutRetry(() =>
      prisma.phaseTracker.delete({
        where: { id: tracker.id },
      }),
    );
  }

  await runWithTimeoutRetry(() =>
    prisma.phaseTracker.create({
      data: {
        organizationId: organization.id,
        currentPhase: 1,
        phases: {
          create: buildBaselinePhases(now),
        },
      },
    }),
  );
  await deleteAuthSessionsForOrganization(organization.id, {
    preserveAuthSessionId,
    preserveUserId: input.actor.id,
  });

  await writeAuditEvent({
    eventKey: "organization.admin.reset",
    eventType: "ops",
    actorId: input.actor.id,
    actorRole: input.actor.role,
    organizationId: organization.id,
    targetEntityType: "organization",
    targetEntityId: organization.id,
    metadata: {
      source: "facilitator_dashboard",
      confirmation: ORGANIZATION_RESET_CONFIRMATION,
    },
  });

  return {
    organizationId: organization.id,
    resetAt: now,
  };
}
