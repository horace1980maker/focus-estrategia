import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ROLES, type UserSession } from "./auth.ts";
import { authenticateWithCredentials, provisionUserAccount } from "./auth-service.ts";
import { getOrganizationMetrics } from "./analytics.ts";
import {
  createOrganizationAsFacilitator,
  ORGANIZATION_DELETE_CONFIRMATION,
  OrganizationAdminServiceError,
  ORGANIZATION_RESET_CONFIRMATION,
  ORGANIZATION_TIME_RESET_CONFIRMATION,
  USER_DELETE_CONFIRMATION,
  removeOrganizationAsFacilitator,
  removeUserAsFacilitator,
  resetOrganizationContentAsFacilitator,
  resetOrganizationTimeTrackingAsFacilitator,
} from "./organization-admin-service.ts";
import { TOTAL_PHASES } from "./phase-model.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupOrganization(organizationId: string) {
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true },
  });

  await prisma.validationSignoff.deleteMany({ where: { organizationId } });
  await prisma.validationFeedbackResponse.deleteMany({ where: { organizationId } });
  await prisma.draftSnapshot.deleteMany({ where: { organizationId } });
  await prisma.draftAssumptionRisk.deleteMany({ where: { organizationId } });
  await prisma.draftLineOfAction.deleteMany({ where: { organizationId } });
  await prisma.draftObjectiveResult.deleteMany({ where: { organizationId } });
  await prisma.deliverable.deleteMany({ where: { organizationId } });
  await prisma.diagnosisSurveyAnswer.deleteMany({
    where: { response: { organizationId } },
  });
  await prisma.diagnosisSurveyResponse.deleteMany({ where: { organizationId } });
  await prisma.diagnosticFinding.deleteMany({ where: { organizationId } });
  await prisma.strategicObjective.deleteMany({ where: { organizationId } });
  await prisma.outcome.deleteMany({ where: { theoryOfChange: { organizationId } } });
  await prisma.pathway.deleteMany({ where: { theoryOfChange: { organizationId } } });
  await prisma.theoryOfChange.deleteMany({ where: { organizationId } });
  await prisma.phaseMigrationAudit.deleteMany({ where: { organizationId } });
  await prisma.activitySession.deleteMany({ where: { organizationId } });
  await prisma.sectionEngagement.deleteMany({ where: { organizationId } });
  await prisma.roiSnapshot.deleteMany({ where: { organizationId } });
  await prisma.roiBenchmarkChange.deleteMany({ where: { organizationId } });
  await prisma.roiSetting.deleteMany({ where: { organizationId } });

  if (tracker?.id) {
    await prisma.phaseOutputCompletion.deleteMany({
      where: { phase: { phaseTrackerId: tracker.id } },
    });
    await prisma.phaseReview.deleteMany({
      where: { phase: { phaseTrackerId: tracker.id } },
    });
    await prisma.phase.deleteMany({ where: { phaseTrackerId: tracker.id } });
    await prisma.phaseTracker.deleteMany({ where: { id: tracker.id } });
  }

  await prisma.authSession.deleteMany({
    where: {
      OR: [
        { organizationContextId: organizationId },
        { user: { organizationId } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

async function createFacilitatorSession() {
  const id = suffix();
  const facilitator = await prisma.user.create({
    data: {
      email: `fac-org-admin-${id}@example.org`,
      username: `fac-org-admin-${id}`,
      name: `Facilitator ${id}`,
      role: ROLES.FACILITATOR,
      organizationId: null,
      isActive: true,
    },
  });

  const session: UserSession = {
    id: facilitator.id,
    email: facilitator.email,
    name: facilitator.name,
    role: ROLES.FACILITATOR,
    organizationId: null,
  };

  return { facilitator, session };
}

test("facilitator can create organization with baseline phase tracker", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const created = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Admin Service ${id}`,
      country: "Guatemala",
      description: "Created from test.",
    });
    organizationId = created.id;

    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: created.id },
      include: { phases: { orderBy: { phaseNumber: "asc" } } },
    });

    assert.ok(tracker);
    assert.equal(tracker?.currentPhase, 1);
    assert.equal(tracker?.phases.length, TOTAL_PHASES);
    assert.equal(tracker?.phases[0]?.status, "in_progress");
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("organization admin service denies non-facilitator create", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: {
      id: `org-admin-deny-${id}`,
      name: `Org Deny ${id}`,
    },
  });

  const ngoAdmin = await prisma.user.create({
    data: {
      email: `ngo-admin-deny-${id}@example.org`,
      username: `ngo-admin-deny-${id}`,
      name: "NGO Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      isActive: true,
    },
  });

  try {
    await assert.rejects(
      () =>
        createOrganizationAsFacilitator({
          actor: {
            id: ngoAdmin.id,
            email: ngoAdmin.email,
            name: ngoAdmin.name,
            role: ROLES.NGO_ADMIN,
            organizationId: organization.id,
          },
          name: `Denied Org ${id}`,
        }),
      /Not authorized for this operation/,
    );
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("facilitator flow can provision organization-admin credentials and authenticate", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Provision ${id}`,
      country: "Honduras",
    });
    organizationId = organization.id;

    const username = `org-provision-${id}-admin`;
    await provisionUserAccount({
      actor: session,
      username,
      name: "Provisioned Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "TempPass123!",
      mustChangePassword: true,
    });

    const login = await authenticateWithCredentials({
      username,
      password: "TempPass123!",
    });

    assert.equal(login.user.role, ROLES.NGO_ADMIN);
    assert.equal(login.user.organizationId, organization.id);
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("organization reset clears workflow artifacts and restores baseline phases", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Reset ${id}`,
      country: "El Salvador",
      description: "This should be cleared by reset.",
    });
    organizationId = organization.id;

    const admin = await prisma.user.create({
      data: {
        email: `org-reset-admin-${id}@example.org`,
        username: `org-reset-admin-${id}`,
        name: "Org Reset Admin",
        role: ROLES.NGO_ADMIN,
        organizationId: organization.id,
        isActive: true,
      },
    });

    await prisma.authSession.create({
      data: {
        userId: admin.id,
        tokenHash: randomUUID(),
        organizationContextId: organization.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const objective = await prisma.strategicObjective.create({
      data: {
        organizationId: organization.id,
        title: "Objective before reset",
      },
    });
    await prisma.draftObjectiveResult.create({
      data: {
        organizationId: organization.id,
        sourceObjectiveId: objective.id,
        title: "Draft objective result",
      },
    });
    await prisma.draftAssumptionRisk.create({
      data: {
        organizationId: organization.id,
        type: "risk",
        description: "Risk before reset",
      },
    });
    await prisma.deliverable.create({
      data: {
        organizationId: organization.id,
        phaseNumber: 6,
        title: "Deliverable before reset",
      },
    });
    await prisma.validationFeedbackResponse.create({
      data: {
        organizationId: organization.id,
        response: "Validation feedback before reset",
        submittedById: admin.id,
      },
    });
    await prisma.validationSignoff.create({
      data: {
        organizationId: organization.id,
        signerName: "Board Member",
        signerRole: "President",
        signedById: admin.id,
      },
    });
    await prisma.activitySession.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        userRole: ROLES.NGO_ADMIN,
        sectionKey: "phase-1",
      },
    });
    await prisma.sectionEngagement.create({
      data: {
        organizationId: organization.id,
        phaseNumber: 1,
        sectionKey: "phase-1",
        windowStart: new Date(Date.now() - 60_000),
        windowEnd: new Date(),
        totalMinutes: 30,
        sessionsCount: 1,
      },
    });

    await resetOrganizationContentAsFacilitator({
      actor: session,
      organizationId: organization.id,
      confirmationText: ORGANIZATION_RESET_CONFIRMATION,
    });

    assert.equal(
      await prisma.strategicObjective.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.draftObjectiveResult.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.draftAssumptionRisk.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.deliverable.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.validationFeedbackResponse.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.validationSignoff.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.activitySession.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.sectionEngagement.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.authSession.count({
        where: {
          OR: [
            { organizationContextId: organization.id },
            { user: { organizationId: organization.id } },
          ],
        },
      }),
      0,
    );

    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: organization.id },
      include: { phases: { orderBy: { phaseNumber: "asc" } } },
    });
    assert.ok(tracker);
    assert.equal(tracker?.currentPhase, 1);
    assert.equal(tracker?.phases.length, TOTAL_PHASES);
    assert.equal(tracker?.phases[0]?.status, "in_progress");

    const persistedOrganization = await prisma.organization.findUnique({
      where: { id: organization.id },
      select: { id: true, name: true, country: true, description: true, logoUrl: true },
    });
    assert.ok(persistedOrganization);
    assert.equal(persistedOrganization?.name, organization.name);
    assert.equal(persistedOrganization?.country, null);
    assert.equal(persistedOrganization?.description, null);
    assert.equal(persistedOrganization?.logoUrl, null);
    const persistedAdmin = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { id: true, organizationId: true },
    });
    assert.ok(persistedAdmin);
    assert.equal(persistedAdmin?.organizationId, organization.id);
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("organization reset preserves facilitator active auth session", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Reset Preserve Session ${id}`,
    });
    organizationId = organization.id;

    const orgAdmin = await prisma.user.create({
      data: {
        email: `org-admin-${id}@example.org`,
        username: `org-admin-${id}`,
        name: `Org Admin ${id}`,
        role: ROLES.NGO_ADMIN,
        organizationId: organization.id,
        isActive: true,
      },
    });

    const facilitatorAuthSession = await prisma.authSession.create({
      data: {
        userId: facilitator.id,
        tokenHash: `token-${randomUUID()}`,
        organizationContextId: organization.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.authSession.create({
      data: {
        userId: orgAdmin.id,
        tokenHash: `token-${randomUUID()}`,
        organizationContextId: organization.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await resetOrganizationContentAsFacilitator({
      actor: {
        ...session,
        organizationId: organization.id,
        authSessionId: facilitatorAuthSession.id,
      },
      organizationId: organization.id,
      confirmationText: ORGANIZATION_RESET_CONFIRMATION,
    });

    const preservedSession = await prisma.authSession.findUnique({
      where: { id: facilitatorAuthSession.id },
      select: { id: true, userId: true, organizationContextId: true },
    });
    assert.ok(preservedSession);
    assert.equal(preservedSession?.userId, facilitator.id);
    assert.equal(preservedSession?.organizationContextId, organization.id);

    const remainingOrganizationSessions = await prisma.authSession.count({
      where: {
        organizationContextId: organization.id,
        NOT: { id: facilitatorAuthSession.id },
      },
    });
    assert.equal(remainingOrganizationSessions, 0);
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("organization reset requires typed confirmation text", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Reset Confirm ${id}`,
    });
    organizationId = organization.id;

    await assert.rejects(
      () =>
        resetOrganizationContentAsFacilitator({
          actor: session,
          organizationId: organization.id,
          confirmationText: "WRONG",
        }),
      (error) =>
        error instanceof OrganizationAdminServiceError &&
        error.code === "RESET_CONFIRMATION_INVALID",
    );
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("organization time reset clears tracked minutes but preserves task totals", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Time Reset ${id}`,
    });
    organizationId = organization.id;

    const admin = await prisma.user.create({
      data: {
        email: `org-time-reset-${id}@example.org`,
        username: `org-time-reset-${id}`,
        name: `Org Time Reset ${id}`,
        role: ROLES.NGO_ADMIN,
        organizationId: organization.id,
      },
    });

    const startedAt = new Date(Date.now() - 45 * 60 * 1000);
    const endedAt = new Date(Date.now() - 15 * 60 * 1000);
    const windowStart = new Date(
      Date.UTC(
        startedAt.getUTCFullYear(),
        startedAt.getUTCMonth(),
        startedAt.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

    await prisma.activitySession.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        userRole: ROLES.NGO_ADMIN,
        phaseNumber: 1,
        sectionKey: "ngo-dashboard",
        startedAt,
        lastActivityAt: endedAt,
        endedAt,
        durationMinutes: 30,
      },
    });
    await prisma.sectionEngagement.create({
      data: {
        organizationId: organization.id,
        phaseNumber: 1,
        sectionKey: "ngo-dashboard",
        windowStart,
        windowEnd,
        totalMinutes: 30,
        sessionsCount: 1,
        completedTasks: 4,
      },
    });

    const beforeReset = await getOrganizationMetrics({
      organizationId: organization.id,
      days: 30,
      until: new Date(),
    });
    assert.equal(beforeReset.totals.trackedMinutes, 30);
    assert.equal(beforeReset.totals.completedTasks, 4);

    await resetOrganizationTimeTrackingAsFacilitator({
      actor: session,
      organizationId: organization.id,
      confirmationText: ORGANIZATION_TIME_RESET_CONFIRMATION,
    });

    const activityCount = await prisma.activitySession.count({
      where: { organizationId: organization.id },
    });
    const engagement = await prisma.sectionEngagement.findFirst({
      where: {
        organizationId: organization.id,
        sectionKey: "ngo-dashboard",
        phaseNumber: 1,
      },
    });
    const afterReset = await getOrganizationMetrics({
      organizationId: organization.id,
      days: 30,
      until: new Date(),
    });

    assert.equal(activityCount, 0);
    assert.equal(engagement?.totalMinutes, 0);
    assert.equal(engagement?.sessionsCount, 0);
    assert.equal(engagement?.completedTasks, 4);
    assert.equal(afterReset.totals.trackedMinutes, 0);
    assert.equal(afterReset.totals.completedTasks, 4);
    assert.equal(afterReset.bySection[0]?.trackedMinutes, 0);
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("facilitator can remove ngo_admin user and revoke access", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let organizationId: string | null = null;
  let removedUserId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Remove User ${id}`,
    });
    organizationId = organization.id;

    const createdUser = await provisionUserAccount({
      actor: session,
      username: `org-remove-user-${id}`,
      name: "User to Remove",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "TempPass123!",
      mustChangePassword: true,
    });
    removedUserId = createdUser.id;

    await prisma.authSession.create({
      data: {
        userId: createdUser.id,
        tokenHash: `token-${randomUUID()}`,
        organizationContextId: organization.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const removed = await removeUserAsFacilitator({
      actor: session,
      userId: createdUser.id,
      confirmationText: USER_DELETE_CONFIRMATION,
    });
    assert.equal(removed.userId, createdUser.id);

    const retired = await prisma.user.findUniqueOrThrow({
      where: { id: createdUser.id },
      select: {
        id: true,
        isActive: true,
        organizationId: true,
        email: true,
        username: true,
      },
    });
    assert.equal(retired.isActive, false);
    assert.equal(retired.organizationId, null);
    assert.equal(retired.email.includes("@deleted.local"), true);
    assert.equal((retired.username ?? "").includes("__deleted__"), true);
    assert.equal(
      await prisma.authSession.count({ where: { userId: createdUser.id } }),
      0,
    );
  } finally {
    if (organizationId) {
      await cleanupOrganization(organizationId);
    }
    if (removedUserId) {
      await prisma.user.deleteMany({ where: { id: removedUserId } });
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("facilitator can remove organization from dashboard", async () => {
  const { facilitator, session } = await createFacilitatorSession();
  const id = suffix();
  let retiredUserId: string | null = null;
  let facilitatorAuthSessionId: string | null = null;
  let organizationId: string | null = null;

  try {
    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: `Org Remove ${id}`,
    });
    organizationId = organization.id;

    const orgUser = await provisionUserAccount({
      actor: session,
      username: `org-remove-admin-${id}`,
      name: "Org Remove Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "TempPass123!",
      mustChangePassword: true,
    });
    retiredUserId = orgUser.id;

    const facilitatorAuthSession = await prisma.authSession.create({
      data: {
        userId: facilitator.id,
        tokenHash: `token-${randomUUID()}`,
        organizationContextId: organization.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    facilitatorAuthSessionId = facilitatorAuthSession.id;

    const removed = await removeOrganizationAsFacilitator({
      actor: {
        ...session,
        organizationId: organization.id,
        authSessionId: facilitatorAuthSession.id,
      },
      organizationId: organization.id,
      confirmationText: ORGANIZATION_DELETE_CONFIRMATION,
    });
    assert.equal(removed.organizationId, organization.id);

    assert.equal(
      await prisma.organization.count({ where: { id: organization.id } }),
      0,
    );
    const retiredUser = await prisma.user.findUniqueOrThrow({
      where: { id: orgUser.id },
      select: { id: true, isActive: true, organizationId: true },
    });
    assert.equal(retiredUser.isActive, false);
    assert.equal(retiredUser.organizationId, null);

    const preservedSession = await prisma.authSession.findUnique({
      where: { id: facilitatorAuthSession.id },
      select: { id: true, organizationContextId: true },
    });
    assert.ok(preservedSession);
    assert.equal(preservedSession?.organizationContextId, null);
  } finally {
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (retiredUserId) {
      await prisma.user.deleteMany({ where: { id: retiredUserId } });
    }
    if (facilitatorAuthSessionId) {
      await prisma.authSession.deleteMany({ where: { id: facilitatorAuthSessionId } });
    }
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});
