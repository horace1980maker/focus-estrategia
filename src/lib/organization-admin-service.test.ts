import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ROLES, type UserSession } from "./auth.ts";
import { authenticateWithCredentials, provisionUserAccount } from "./auth-service.ts";
import {
  createOrganizationAsFacilitator,
  OrganizationAdminServiceError,
  ORGANIZATION_RESET_CONFIRMATION,
  resetOrganizationContentAsFacilitator,
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
