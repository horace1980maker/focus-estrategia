import assert from "node:assert/strict";
import test from "node:test";
import { ROLES, type UserSession } from "./auth.ts";
import { getPhaseOutputStatus, initializePhases } from "./phases.ts";
import { prisma } from "./prisma.ts";
import {
  addValidationSignature,
  deleteValidationSignature,
  saveValidationFeedback,
} from "./validation-mutations.ts";
import { getValidationReadiness } from "./validation-readiness-sync.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function toSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}): UserSession {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserSession["role"],
    organizationId: user.organizationId,
  };
}

async function cleanupOrganization(organizationId: string) {
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true },
  });

  if (tracker) {
    await prisma.phaseOutputCompletion.deleteMany({
      where: { phase: { phaseTrackerId: tracker.id } },
    });
    await prisma.phaseReview.deleteMany({
      where: { phase: { phaseTrackerId: tracker.id } },
    });
    await prisma.phase.deleteMany({
      where: { phaseTrackerId: tracker.id },
    });
    await prisma.phaseTracker.delete({
      where: { id: tracker.id },
    });
  }

  await prisma.validationSignoff.deleteMany({ where: { organizationId } });
  await prisma.validationFeedbackResponse.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

test("saveValidationFeedback upserts and syncs the facilitator-response output", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-val-${id}`, name: `Validation Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${id}@example.org`,
      username: `admin-${id}`,
      name: "Validation Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    const session = toSession(admin);

    const firstSave = await saveValidationFeedback({
      session,
      organizationId: organization.id,
      response: "Initial facilitator response acknowledged.",
    });
    assert.equal(firstSave.success, true);

    const secondSave = await saveValidationFeedback({
      session,
      organizationId: organization.id,
      response: "Updated response after internal review.",
    });
    assert.equal(secondSave.success, true);

    const responseRow = await prisma.validationFeedbackResponse.findUnique({
      where: { organizationId: organization.id },
    });
    assert.equal(responseRow?.response, "Updated response after internal review.");
    assert.equal(
      await prisma.validationFeedbackResponse.count({
        where: { organizationId: organization.id },
      }),
      1,
    );

    const outputSummary = await getPhaseOutputStatus(organization.id, 5);
    const feedbackOutput = outputSummary.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    assert.equal(feedbackOutput?.isCompleted, true);
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("validation mutations enforce permission and organization scope", async () => {
  const id = suffix();
  const organizationA = await prisma.organization.create({
    data: { id: `org-val-a-${id}`, name: `Validation Org A ${id}` },
  });
  const organizationB = await prisma.organization.create({
    data: { id: `org-val-b-${id}`, name: `Validation Org B ${id}` },
  });
  const adminA = await prisma.user.create({
    data: {
      email: `admin-a-${id}@example.org`,
      username: `admin-a-${id}`,
      name: "Org A Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organizationA.id,
    },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `fac-${id}@example.org`,
      username: `fac-${id}`,
      name: "Facilitator",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  try {
    await initializePhases(organizationA.id);
    await initializePhases(organizationB.id);

    const facilitatorAttempt = await saveValidationFeedback({
      session: toSession(facilitator),
      organizationId: organizationA.id,
      response: "Should not be accepted",
    });
    assert.equal(facilitatorAttempt.success, false);
    assert.equal(facilitatorAttempt.error, "Unauthorized: Missing permission.");

    const crossOrgAttempt = await saveValidationFeedback({
      session: toSession(adminA),
      organizationId: organizationB.id,
      response: "Cross-org write should fail",
    });
    assert.equal(crossOrgAttempt.success, false);
    assert.equal(crossOrgAttempt.error, "Unauthorized: Invalid organization.");
  } finally {
    await cleanupOrganization(organizationA.id);
    await cleanupOrganization(organizationB.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("validated plan lock blocks additional writes once first signoff is captured", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-val-lock-${id}`, name: `Validation Lock Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-lock-${id}@example.org`,
      username: `admin-lock-${id}`,
      name: "Validation Lock Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    const session = toSession(admin);

    const firstSignature = await addValidationSignature({
      session,
      organizationId: organization.id,
      signerName: "Executive Director",
      signerRole: "Director",
    });
    assert.equal(firstSignature.success, true);

    const signoffRow = await prisma.validationSignoff.findFirst({
      where: { organizationId: organization.id },
      select: { id: true },
    });
    assert.ok(signoffRow?.id);

    const outputSummary = await getPhaseOutputStatus(organization.id, 5);
    const validatedPlanOutput = outputSummary.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(validatedPlanOutput?.isCompleted, true);

    const secondSignature = await addValidationSignature({
      session,
      organizationId: organization.id,
      signerName: "Board President",
      signerRole: "President",
    });
    assert.equal(secondSignature.success, false);
    assert.equal(
      secondSignature.error,
      "Validation is locked after the plan has been marked as validated.",
    );

    const feedbackAfterLock = await saveValidationFeedback({
      session,
      organizationId: organization.id,
      response: "Late update should be denied",
    });
    assert.equal(feedbackAfterLock.success, false);
    assert.equal(
      feedbackAfterLock.error,
      "Validation is locked after the plan has been marked as validated.",
    );

    const deleteAfterLock = await deleteValidationSignature({
      session,
      organizationId: organization.id,
      signatureId: signoffRow.id,
    });
    assert.equal(deleteAfterLock.success, false);
    assert.equal(
      deleteAfterLock.error,
      "Validation is locked after the plan has been marked as validated.",
    );
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("reading validation readiness does not mutate phase 5 output completion", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-val-read-${id}`, name: `Validation Read Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-read-${id}@example.org`,
      username: `admin-read-${id}`,
      name: "Validation Read Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);

    await prisma.validationFeedbackResponse.create({
      data: {
        organizationId: organization.id,
        response: "Ready for facilitator review.",
        submittedById: admin.id,
      },
    });

    const before = await getPhaseOutputStatus(organization.id, 5);
    const beforeFeedback = before.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    const beforeValidatedPlan = before.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(beforeFeedback?.isCompleted, false);
    assert.equal(beforeValidatedPlan?.isCompleted, false);

    const readiness = await getValidationReadiness(organization.id);
    assert.equal(readiness.isFeedbackComplete, true);
    assert.equal(readiness.isValidatedPlanComplete, false);

    const after = await getPhaseOutputStatus(organization.id, 5);
    const afterFeedback = after.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    const afterValidatedPlan = after.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(afterFeedback?.isCompleted, false);
    assert.equal(afterValidatedPlan?.isCompleted, false);
  } finally {
    await cleanupOrganization(organization.id);
  }
});
