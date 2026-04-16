import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPhase,
  getPhaseOutputStatus,
  getPhaseStatus,
  initializePhases,
  requestPhaseReview,
  approvePhase,
  updatePhaseOutputStatus,
  PhaseGateError,
} from "./phases.ts";
import { syncValidationOutputCompletion } from "./validation-readiness-sync.ts";
import { evaluateValidationReadiness } from "./validation-readiness.ts";
import { ROLES } from "./auth.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupOrganization(organizationId: string) {
  const phaseTrackers = await prisma.phaseTracker.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const phaseTrackerIds = phaseTrackers.map((tracker) => tracker.id);
  const phases = phaseTrackerIds.length
    ? await prisma.phase.findMany({
        where: {
          phaseTrackerId: { in: phaseTrackerIds },
        },
        select: { id: true },
      })
    : [];
  const phaseIds = phases.map((phase) => phase.id);

  if (phaseIds.length) {
    await prisma.phaseOutputCompletion.deleteMany({
      where: { phaseId: { in: phaseIds } },
    });
    await prisma.phaseReview.deleteMany({
      where: { phaseId: { in: phaseIds } },
    });
  }

  await prisma.phase.deleteMany({
    where: {
      phaseTrackerId: { in: phaseTrackerIds },
    },
  });
  await prisma.phaseTracker.deleteMany({ where: { organizationId } });
  await prisma.phaseMigrationAudit.deleteMany({ where: { organizationId } });
  await prisma.diagnosisSurveyResponse.deleteMany({ where: { organizationId } });
  await prisma.roiSnapshot.deleteMany({ where: { organizationId } });
  await prisma.roiSetting.deleteMany({ where: { organizationId } });
  await prisma.sectionEngagement.deleteMany({ where: { organizationId } });
  await prisma.activitySession.deleteMany({ where: { organizationId } });
  await prisma.onboardingEvidence.deleteMany({ where: { organizationId } });
  await prisma.onboardingParticipant.deleteMany({ where: { organizationId } });
  await prisma.onboardingWorkspace.deleteMany({ where: { organizationId } });
  await prisma.facilitatorGuidanceTask.deleteMany({
    where: {
      guidance: {
        organizationId,
      },
    },
  });
  await prisma.facilitatorGuidance.deleteMany({ where: { organizationId } });
  await prisma.validationSignoff.deleteMany({ where: { organizationId } });
  await prisma.validationFeedbackResponse.deleteMany({ where: { organizationId } });
  await prisma.deliverable.deleteMany({ where: { organizationId } });
  await prisma.diagnosticFinding.deleteMany({ where: { organizationId } });
  await prisma.strategicObjective.deleteMany({ where: { organizationId } });
  await prisma.theoryOfChange.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

async function seedPhase1OnboardingRequirements(
  organizationId: string,
  completedById: string,
) {
  await prisma.onboardingWorkspace.upsert({
    where: { organizationId },
    create: {
      organizationId,
      mouDocumentUrl: `https://drive.google.com/file/d/mou-${organizationId}`,
      updatedById: completedById,
    },
    update: {
      mouDocumentUrl: `https://drive.google.com/file/d/mou-${organizationId}`,
      updatedById: completedById,
    },
  });

  const evidenceCount = await prisma.onboardingEvidence.count({
    where: { organizationId },
  });
  if (evidenceCount === 0) {
    await prisma.onboardingEvidence.create({
      data: {
        organizationId,
        fileName: "organization-documentation.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1,
        fileBytes: Buffer.from([1]),
        uploadedById: completedById,
      },
    });
  }
}

async function completeAllPhaseOutputs(
  organizationId: string,
  phaseNumber: number,
  completedById: string,
) {
  if (phaseNumber === 1) {
    await seedPhase1OnboardingRequirements(organizationId, completedById);
  }

  const summary = await getPhaseOutputStatus(organizationId, phaseNumber);
  for (const output of summary.missingOutputs) {
    await updatePhaseOutputStatus({
      organizationId,
      phaseNumber,
      outputKey: output.outputKey,
      isCompleted: true,
      completedById,
    });
  }
}

test("requestPhaseReview blocks when required outputs are missing", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Phase Test Org ${id}` },
  });

  try {
    await initializePhases(organization.id);

    await assert.rejects(
      () => requestPhaseReview(organization.id, 1),
      (error: unknown) =>
        error instanceof PhaseGateError && error.code === "MISSING_REQUIRED_OUTPUTS",
    );
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("phase review and approval works after required outputs are complete", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Phase Approval Org ${id}` },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `fac-${id}@example.org`,
      name: "Facilitator",
      role: ROLES.FACILITATOR,
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${id}@example.org`,
      name: "NGO Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    await completeAllPhaseOutputs(organization.id, 1, admin.id);

    await requestPhaseReview(organization.id, 1);
    const approvalResult = await approvePhase(organization.id, 1, facilitator.id, "Looks good");

    assert.equal(approvalResult.unlockedNext, true);

    const status = await getPhaseStatus(organization.id);
    const phase1 = status?.phases.find((phase) => phase.phaseNumber === 1);
    const phase2 = status?.phases.find((phase) => phase.phaseNumber === 2);
    assert.equal(phase1?.status, "approved");
    assert.equal(phase2?.status, "in_progress");

    const review = await prisma.phaseReview.findFirst({
      where: { phaseId: phase1?.id },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(review?.reviewerId, facilitator.id);
    assert.equal(review?.decision, "approved");
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("deliverables phase access requires validation approval and upstream outputs", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Deliverables Access Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-deliverables-${id}@example.org`,
      name: "NGO Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    const tracker = await getPhaseStatus(organization.id);
    assert.ok(tracker);

    await prisma.phaseTracker.update({
      where: { organizationId: organization.id },
      data: { currentPhase: 6 },
    });

    await prisma.phase.updateMany({
      where: {
        phaseTrackerId: tracker!.id,
        phaseNumber: { in: [1, 2, 3, 4, 5] },
      },
      data: { status: "approved" },
    });

    for (const phaseNumber of [1, 2, 3, 4, 5]) {
      await completeAllPhaseOutputs(organization.id, phaseNumber, admin.id);
    }

    await updatePhaseOutputStatus({
      organizationId: organization.id,
      phaseNumber: 4,
      outputKey: "implementation-roadmap",
      isCompleted: false,
      completedById: admin.id,
    });

    const blocked = await canAccessPhase(organization.id, 6);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason?.includes("upstream required outputs"), true);
    assert.ok(blocked.missingOutputs && blocked.missingOutputs.length > 0);

    await updatePhaseOutputStatus({
      organizationId: organization.id,
      phaseNumber: 4,
      outputKey: "implementation-roadmap",
      isCompleted: true,
      completedById: admin.id,
    });

    const allowed = await canAccessPhase(organization.id, 6);
    assert.equal(allowed.allowed, true);
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("evaluateValidationReadiness maps completion states and percentage", () => {
  assert.deepEqual(
    evaluateValidationReadiness({
      hasFeedbackResponse: false,
      signatureCount: 0,
    }),
    {
      isFeedbackComplete: false,
      isValidatedPlanComplete: false,
      progressPercentage: 0,
    },
  );

  assert.deepEqual(
    evaluateValidationReadiness({
      hasFeedbackResponse: true,
      signatureCount: 0,
    }),
    {
      isFeedbackComplete: true,
      isValidatedPlanComplete: false,
      progressPercentage: 50,
    },
  );

  assert.deepEqual(
    evaluateValidationReadiness({
      hasFeedbackResponse: true,
      signatureCount: 1,
    }),
    {
      isFeedbackComplete: true,
      isValidatedPlanComplete: true,
      progressPercentage: 100,
    },
  );
});

test("syncValidationOutputCompletion toggles phase 5 output contracts from validation records", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Validation Sync Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-validation-${id}@example.org`,
      name: "Validation Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);

    let readiness = await syncValidationOutputCompletion(organization.id);
    assert.equal(readiness.progressPercentage, 0);

    let summary = await getPhaseOutputStatus(organization.id, 5);
    let facilitatorResponse = summary.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    let validatedPlan = summary.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(facilitatorResponse?.isCompleted, false);
    assert.equal(validatedPlan?.isCompleted, false);

    await prisma.validationFeedbackResponse.create({
      data: {
        organizationId: organization.id,
        response: "Confirmed and aligned with facilitator feedback.",
        submittedById: admin.id,
      },
    });

    readiness = await syncValidationOutputCompletion(organization.id);
    assert.equal(readiness.isFeedbackComplete, true);
    assert.equal(readiness.isValidatedPlanComplete, false);
    assert.equal(readiness.progressPercentage, 50);

    summary = await getPhaseOutputStatus(organization.id, 5);
    facilitatorResponse = summary.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    validatedPlan = summary.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(facilitatorResponse?.isCompleted, true);
    assert.equal(validatedPlan?.isCompleted, false);

    await prisma.validationSignoff.create({
      data: {
        organizationId: organization.id,
        signerName: "Executive Director",
        signerRole: "Director",
        signedById: admin.id,
      },
    });

    readiness = await syncValidationOutputCompletion(organization.id);
    assert.equal(readiness.isFeedbackComplete, true);
    assert.equal(readiness.isValidatedPlanComplete, true);
    assert.equal(readiness.progressPercentage, 100);

    summary = await getPhaseOutputStatus(organization.id, 5);
    facilitatorResponse = summary.outputs.find(
      (output) => output.outputKey === "facilitator-review-response",
    );
    validatedPlan = summary.outputs.find(
      (output) => output.outputKey === "validated-plan",
    );
    assert.equal(facilitatorResponse?.isCompleted, true);
    assert.equal(validatedPlan?.isCompleted, true);
  } finally {
    await cleanupOrganization(organization.id);
  }
});
