import assert from "node:assert/strict";
import test from "node:test";
import {
  approveDeliverableVersion,
  createOrRegenerateDeliverableVersion,
  publishDeliverableVersion,
  requestDeliverableExport,
  submitDeliverableForReview,
} from "./deliverables.ts";
import {
  getPhaseOutputStatus,
  initializePhases,
  updatePhaseOutputStatus,
} from "./phases.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupOrganization(organizationId: string) {
  const trackers = await prisma.phaseTracker.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const trackerIds = trackers.map((tracker) => tracker.id);
  const phases = trackerIds.length
    ? await prisma.phase.findMany({
        where: { phaseTrackerId: { in: trackerIds } },
        select: { id: true },
      })
    : [];
  const phaseIds = phases.map((phase) => phase.id);

  if (phaseIds.length) {
    await prisma.phaseOutputCompletion.deleteMany({ where: { phaseId: { in: phaseIds } } });
    await prisma.phaseReview.deleteMany({ where: { phaseId: { in: phaseIds } } });
  }

  await prisma.deliverable.deleteMany({ where: { organizationId } });
  await prisma.phase.deleteMany({ where: { phaseTrackerId: { in: trackerIds } } });
  await prisma.phaseTracker.deleteMany({ where: { organizationId } });
  await prisma.phaseMigrationAudit.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

async function completeOutputsAndApproveValidation(organizationId: string, completedById: string) {
  for (const phaseNumber of [1, 2, 3, 4, 5]) {
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

  const tracker = await prisma.phaseTracker.findUniqueOrThrow({
    where: { organizationId },
    include: { phases: true },
  });

  await prisma.phase.updateMany({
    where: {
      phaseTrackerId: tracker.id,
      phaseNumber: { in: [1, 2, 3, 4, 5] },
    },
    data: {
      status: "approved",
    },
  });
  await prisma.phase.updateMany({
    where: {
      phaseTrackerId: tracker.id,
      phaseNumber: 6,
    },
    data: {
      status: "in_progress",
    },
  });
  await prisma.phaseTracker.update({
    where: { organizationId },
    data: { currentPhase: 6 },
  });
}

test("deliverable lifecycle transitions from draft to published", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Deliverable Lifecycle Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `deliverable-admin-${id}@example.org`,
      name: "Deliverable Admin",
      role: "ngo_admin",
      organizationId: organization.id,
    },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `deliverable-facilitator-${id}@example.org`,
      name: "Deliverable Facilitator",
      role: "facilitator",
    },
  });

  try {
    await initializePhases(organization.id);
    await completeOutputsAndApproveValidation(organization.id, admin.id);

    const generated = await createOrRegenerateDeliverableVersion({
      organizationId: organization.id,
    });
    assert.equal(generated.deliverable.status, "draft");
    assert.equal(generated.deliverable.readinessStatus, "ready_for_review");

    const inReview = await submitDeliverableForReview({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
    });
    assert.equal(inReview.status, "in_review");

    const approved = await approveDeliverableVersion({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
      reviewerId: facilitator.id,
    });
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedById, facilitator.id);

    const published = await publishDeliverableVersion({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
    });
    assert.equal(published.status, "published");
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("deliverable export is idempotent for same version and format", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Deliverable Export Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `deliverable-export-admin-${id}@example.org`,
      name: "Export Admin",
      role: "ngo_admin",
      organizationId: organization.id,
    },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `deliverable-export-facilitator-${id}@example.org`,
      name: "Export Facilitator",
      role: "facilitator",
    },
  });

  try {
    await initializePhases(organization.id);
    await completeOutputsAndApproveValidation(organization.id, admin.id);
    const generated = await createOrRegenerateDeliverableVersion({
      organizationId: organization.id,
    });
    await submitDeliverableForReview({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
    });
    await approveDeliverableVersion({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
      reviewerId: facilitator.id,
    });

    const first = await requestDeliverableExport({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
      format: "pdf",
    });
    const second = await requestDeliverableExport({
      organizationId: organization.id,
      deliverableId: generated.deliverable.id,
      format: "pdf",
    });

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.export.url, second.export.url);
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("regenerate deliverable creates incremented versions", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Deliverable Version Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `deliverable-version-admin-${id}@example.org`,
      name: "Version Admin",
      role: "ngo_admin",
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    await completeOutputsAndApproveValidation(organization.id, admin.id);

    const first = await createOrRegenerateDeliverableVersion({
      organizationId: organization.id,
    });
    const second = await createOrRegenerateDeliverableVersion({
      organizationId: organization.id,
    });

    assert.equal(first.deliverable.versionNumber, 1);
    assert.equal(second.deliverable.versionNumber, 2);
  } finally {
    await cleanupOrganization(organization.id);
  }
});
