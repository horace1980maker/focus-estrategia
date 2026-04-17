import assert from "node:assert/strict";
import test from "node:test";
import { ROLES, hasPermission, type UserSession } from "./auth.ts";
import { AuthorizationError, requireOrganizationScope } from "./access-guards.ts";
import {
  SESSION_TIMEOUT_MINUTES,
  canAccessCohortAnalytics,
  getCohortMetrics,
  getOrganizationMetrics,
  calculateRoiValues,
  ensureDefaultRoiSetting,
  finalizeActivitySessionById,
  getEffectiveRoiSetting,
  getScopedRoiSetting,
  reconcileAnalyticsProjection,
  recordTaskCompletion,
  startOrResumeActivitySession,
  touchActivitySession,
  updateRoiSetting,
} from "./analytics.ts";
import {
  approveDeliverableVersion,
  createOrRegenerateDeliverableVersion,
  submitDeliverableForReview,
} from "./deliverables.ts";
import {
  getPhaseOutputStatus,
  initializePhases,
  updatePhaseOutputStatus,
} from "./phases.ts";
import { prisma } from "./prisma.ts";
import { canReadCohortAnalytics } from "../app/api/analytics/cohort/route.ts";
import { resolveOrganizationAnalyticsScope } from "../app/api/analytics/org/route.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupByOrganization(organizationId: string) {
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

  await prisma.activitySession.deleteMany({ where: { organizationId } });
  await prisma.sectionEngagement.deleteMany({ where: { organizationId } });
  await prisma.deliverable.deleteMany({ where: { organizationId } });
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
  await prisma.phase.deleteMany({ where: { phaseTrackerId: { in: trackerIds } } });
  await prisma.phaseTracker.deleteMany({ where: { organizationId } });
  await prisma.phaseMigrationAudit.deleteMany({ where: { organizationId } });
  await prisma.roiSnapshot.deleteMany({ where: { organizationId } });
  await prisma.roiSetting.deleteMany({ where: { organizationId } });
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

async function completeOutputs(
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

async function moveOrgToDeliverablesReadyState(organizationId: string, completedById: string) {
  for (const phaseNumber of [1, 2, 3, 4, 5]) {
    await completeOutputs(organizationId, phaseNumber, completedById);
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
    data: { status: "approved" },
  });
  await prisma.phase.updateMany({
    where: {
      phaseTrackerId: tracker.id,
      phaseNumber: 6,
    },
    data: { status: "in_progress" },
  });
  await prisma.phaseTracker.update({
    where: { organizationId },
    data: { currentPhase: 6 },
  });
}

test("calculateRoiValues clamps negative savings to zero", () => {
  const values = calculateRoiValues({
    trackedMinutes: 600,
    completedTasks: 1,
    hourlyRateUsd: 20,
    baselineManualHoursPerTask: 2,
  });

  assert.equal(values.platformHours, 10);
  assert.equal(values.manualHoursEstimate, 2);
  assert.equal(values.hoursSaved, 0);
  assert.equal(values.usdSaved, 0);
});

test("cohort analytics access is restricted to focus_coordinator", () => {
  const coordinator: UserSession = {
    id: "coord-1",
    email: "coord@example.org",
    name: "Coordinator",
    role: ROLES.FOCUS_COORDINATOR,
    organizationId: null,
  };
  const ngoAdmin: UserSession = {
    id: "ngo-admin-1",
    email: "ngo@example.org",
    name: "NGO Admin",
    role: ROLES.NGO_ADMIN,
    organizationId: "org-1",
  };

  assert.equal(canAccessCohortAnalytics(coordinator), true);
  assert.equal(canAccessCohortAnalytics(ngoAdmin), false);
  assert.equal(canReadCohortAnalytics(coordinator), true);
  assert.equal(canReadCohortAnalytics(ngoAdmin), false);
});

test("organization analytics scope allows facilitator follow-up and blocks NGO cross-org reads", () => {
  const facilitator: UserSession = {
    id: "fac-1",
    email: "fac@example.org",
    name: "Facilitator",
    role: ROLES.FACILITATOR,
    organizationId: "org-1",
  };
  const coordinator: UserSession = {
    id: "coord-2",
    email: "coord-2@example.org",
    name: "Coordinator",
    role: ROLES.FOCUS_COORDINATOR,
    organizationId: null,
  };
  const ngoAdmin: UserSession = {
    id: "ngo-admin-2",
    email: "ngo-2@example.org",
    name: "NGO Admin",
    role: ROLES.NGO_ADMIN,
    organizationId: "org-1",
  };

  const facilitatorAllowed = resolveOrganizationAnalyticsScope(facilitator, "org-2");
  assert.equal(facilitatorAllowed.organizationId, "org-2");
  assert.equal(facilitatorAllowed.error, undefined);

  const ngoForbidden = resolveOrganizationAnalyticsScope(ngoAdmin, "org-2");
  assert.equal(ngoForbidden.organizationId, null);
  assert.equal(ngoForbidden.status, 403);

  const allowed = resolveOrganizationAnalyticsScope(coordinator, "org-2");
  assert.equal(allowed.organizationId, "org-2");
  assert.equal(allowed.error, undefined);

  const missing = resolveOrganizationAnalyticsScope(coordinator, null);
  assert.equal(missing.organizationId, null);
  assert.equal(missing.status, 400);
});

test("facilitator cross-org follow-up allows review scope and blocks NGO-only ownership actions", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-followup-${id}`, name: `Follow-up Org ${id}` },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `fac-followup-${id}@example.org`,
      name: "Follow-up Facilitator",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  const facilitatorSession: UserSession = {
    id: facilitator.id,
    email: facilitator.email,
    name: facilitator.name,
    role: ROLES.FACILITATOR,
    organizationId: null,
  };

  try {
    await requireOrganizationScope({
      session: facilitatorSession,
      organizationId: organization.id,
      action: "read",
      context: {
        reason: "facilitator_followup_read_allowed",
        targetEntityType: "phase",
        targetEntityId: "2",
      },
    });

    await requireOrganizationScope({
      session: facilitatorSession,
      organizationId: organization.id,
      action: "write",
      allowFacilitatorWrite: true,
      context: {
        reason: "facilitator_review_action_allowed",
        targetEntityType: "phase_review",
        targetEntityId: "2",
      },
    });

    await assert.rejects(
      () =>
        requireOrganizationScope({
          session: facilitatorSession,
          organizationId: organization.id,
          action: "write",
          allowFacilitatorWrite: false,
          context: {
            reason: "ngo_only_ownership_action_blocked",
            targetEntityType: "phase_output",
            targetEntityId: "2:diagnosis-survey-v2",
          },
        }),
      (error) => {
        assert.ok(error instanceof AuthorizationError);
        assert.equal(error.code, "FACILITATOR_WRITE_FORBIDDEN");
        return true;
      },
    );

    assert.equal(hasPermission(facilitatorSession.role, "canApprovePhases"), true);
    assert.equal(hasPermission(facilitatorSession.role, "canEditOrgData"), false);

    const deniedEvent = await prisma.auditEvent.findFirst({
      where: {
        actorId: facilitator.id,
        organizationId: organization.id,
        eventKey: "security.authorization.denied",
        targetEntityType: "phase_output",
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(deniedEvent);
  } finally {
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
    await prisma.organization.deleteMany({ where: { id: organization.id } });
  }
});

test("ROI settings use default and allow org override for authorized NGO admin", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Test Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${id}@example.org`,
      name: "Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });
  const coordinator = await prisma.user.create({
    data: {
      email: `coord-${id}@example.org`,
      name: "Coordinator",
      role: ROLES.FOCUS_COORDINATOR,
      organizationId: null,
    },
  });

  try {
    const defaultSetting = await ensureDefaultRoiSetting("test-suite");
    assert.equal(defaultSetting.hourlyRateUsd, 20);

    const beforeOverride = await getEffectiveRoiSetting(organization.id);
    assert.equal(beforeOverride.hourlyRateUsd, 20);

    const adminSession: UserSession = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    };

    const coordinatorSession: UserSession = {
      id: coordinator.id,
      email: coordinator.email,
      name: coordinator.name,
      role: ROLES.FOCUS_COORDINATOR,
      organizationId: null,
    };

    await updateRoiSetting({
      session: adminSession,
      organizationId: organization.id,
      hourlyRateUsd: 28,
      baselineManualHoursPerTask: 2.5,
    });

    const afterOverride = await getEffectiveRoiSetting(organization.id);
    assert.equal(afterOverride.hourlyRateUsd, 28);
    assert.equal(afterOverride.baselineManualHoursPerTask, 2.5);
    assert.equal(afterOverride.updatedBy, admin.id);

    await assert.rejects(
      () =>
        updateRoiSetting({
          session: coordinatorSession,
          organizationId: organization.id,
          hourlyRateUsd: 10,
          baselineManualHoursPerTask: 1,
        }),
      /Not authorized/,
    );
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("ROI setting access rejects cross-org NGO reads and non-coordinator default updates", async () => {
  const id = suffix();
  const orgA = await prisma.organization.create({
    data: { name: `Org A ${id}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `Org B ${id}` },
  });
  const adminA = await prisma.user.create({
    data: {
      email: `admin-a-${id}@example.org`,
      name: "Admin A",
      role: ROLES.NGO_ADMIN,
      organizationId: orgA.id,
    },
  });
  const adminB = await prisma.user.create({
    data: {
      email: `admin-b-${id}@example.org`,
      name: "Admin B",
      role: ROLES.NGO_ADMIN,
      organizationId: orgB.id,
    },
  });
  const coordinator = await prisma.user.create({
    data: {
      email: `coord-${id}@example.org`,
      name: "Coordinator",
      role: ROLES.FOCUS_COORDINATOR,
      organizationId: null,
    },
  });

  try {
    const adminASession: UserSession = {
      id: adminA.id,
      email: adminA.email,
      name: adminA.name,
      role: ROLES.NGO_ADMIN,
      organizationId: orgA.id,
    };
    const adminBSession: UserSession = {
      id: adminB.id,
      email: adminB.email,
      name: adminB.name,
      role: ROLES.NGO_ADMIN,
      organizationId: orgB.id,
    };
    const coordinatorSession: UserSession = {
      id: coordinator.id,
      email: coordinator.email,
      name: coordinator.name,
      role: ROLES.FOCUS_COORDINATOR,
      organizationId: null,
    };

    await updateRoiSetting({
      session: adminBSession,
      organizationId: orgB.id,
      hourlyRateUsd: 31,
      baselineManualHoursPerTask: 2,
    });

    await assert.rejects(
      () =>
        getScopedRoiSetting({
          session: adminASession,
          organizationId: orgB.id,
        }),
      /Not authorized/,
    );

    const allowedForCoordinator = await getScopedRoiSetting({
      session: coordinatorSession,
      organizationId: orgB.id,
    });
    assert.equal(allowedForCoordinator.organizationId, orgB.id);

    await assert.rejects(
      () =>
        updateRoiSetting({
          session: adminASession,
          organizationId: null,
          hourlyRateUsd: 19,
          baselineManualHoursPerTask: 1.2,
        }),
      /Not authorized/,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: coordinator.id } });
    await cleanupByOrganization(orgA.id);
    await cleanupByOrganization(orgB.id);
  }
});

test("session lifecycle closes correctly and avoids duplicate active sessions", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Session Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `session-admin-${id}@example.org`,
      name: "Session Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  const session: UserSession = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: ROLES.NGO_ADMIN,
    organizationId: organization.id,
  };

  try {
    const first = await startOrResumeActivitySession({
      session,
      sectionKey: "ngo-dashboard",
      phaseNumber: 2,
    });
    const second = await startOrResumeActivitySession({
      session,
      sectionKey: "ngo-dashboard",
      phaseNumber: 2,
    });

    assert.equal(first.id, second.id);

    await touchActivitySession({
      session,
      sessionId: first.id,
    });

    const closed = await finalizeActivitySessionById({
      session,
      sessionId: first.id,
    });

    assert.ok(closed);
    assert.ok(closed?.endedAt);
    assert.ok((closed?.durationMinutes ?? 0) >= 1);

    await recordTaskCompletion({
      organizationId: organization.id,
      sectionKey: "ngo-dashboard",
      phaseNumber: 2,
      count: 2,
    });

    const aggregate = await prisma.sectionEngagement.findFirst({
      where: {
        organizationId: organization.id,
        sectionKey: "ngo-dashboard",
        phaseNumber: 2,
      },
    });

    assert.ok(aggregate);
    assert.ok((aggregate?.sessionsCount ?? 0) >= 1);
    assert.ok((aggregate?.totalMinutes ?? 0) >= 1);
    assert.ok((aggregate?.completedTasks ?? 0) >= 2);
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("starting a different section closes previously-open user sessions", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Session Switch Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `session-switch-admin-${id}@example.org`,
      name: "Session Switch Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  const session: UserSession = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: ROLES.NGO_ADMIN,
    organizationId: organization.id,
  };

  try {
    const first = await startOrResumeActivitySession({
      session,
      sectionKey: "ngo-dashboard",
      phaseNumber: 2,
    });
    const second = await startOrResumeActivitySession({
      session,
      sectionKey: "phase-2-workspace",
      phaseNumber: 2,
    });

    const refreshedFirst = await prisma.activitySession.findUniqueOrThrow({
      where: { id: first.id },
    });
    const openSessions = await prisma.activitySession.findMany({
      where: {
        organizationId: organization.id,
        userId: admin.id,
        endedAt: null,
      },
    });

    assert.ok(refreshedFirst.endedAt);
    assert.equal(openSessions.length, 1);
    assert.equal(openSessions[0]?.id, second.id);
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("organization metrics dedupe overlapping session time per user", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Session Overlap Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `session-overlap-admin-${id}@example.org`,
      name: "Session Overlap Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    const now = new Date();
    const startedAtA = new Date(now.getTime() - 60 * 60 * 1000);
    const endedAtA = new Date(now.getTime() - 20 * 60 * 1000);
    const startedAtB = new Date(now.getTime() - 50 * 60 * 1000);
    const endedAtB = new Date(now.getTime() - 10 * 60 * 1000);

    await prisma.activitySession.createMany({
      data: [
        {
          organizationId: organization.id,
          userId: admin.id,
          userRole: admin.role,
          phaseNumber: 2,
          sectionKey: "ngo-dashboard",
          startedAt: startedAtA,
          lastActivityAt: endedAtA,
          endedAt: endedAtA,
          durationMinutes: 40,
        },
        {
          organizationId: organization.id,
          userId: admin.id,
          userRole: admin.role,
          phaseNumber: 2,
          sectionKey: "phase-2-workspace",
          startedAt: startedAtB,
          lastActivityAt: endedAtB,
          endedAt: endedAtB,
          durationMinutes: 40,
        },
      ],
    });

    const windowStart = new Date(
      Date.UTC(
        startedAtA.getUTCFullYear(),
        startedAtA.getUTCMonth(),
        startedAtA.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

    await prisma.sectionEngagement.create({
      data: {
        organizationId: organization.id,
        phaseNumber: 2,
        sectionKey: "ngo-dashboard",
        windowStart,
        windowEnd,
        totalMinutes: 80,
        sessionsCount: 2,
        completedTasks: 0,
      },
    });

    const metrics = await getOrganizationMetrics({
      organizationId: organization.id,
      days: 30,
      until: now,
    });

    assert.equal(metrics.totals.trackedMinutes, 50);
    assert.equal(metrics.bySection[0]?.trackedMinutes, 80);
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("stale timeout sessions are capped at last activity plus timeout window", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Session Timeout Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `session-timeout-admin-${id}@example.org`,
      name: "Session Timeout Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  const session: UserSession = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: ROLES.NGO_ADMIN,
    organizationId: organization.id,
  };

  try {
    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastActivityAt = new Date(startedAt.getTime() + 5 * 60 * 1000);
    const expectedEnd = new Date(
      lastActivityAt.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000,
    );

    const stale = await prisma.activitySession.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        userRole: admin.role,
        phaseNumber: 1,
        sectionKey: "ngo-dashboard",
        startedAt,
        lastActivityAt,
      },
    });

    await startOrResumeActivitySession({
      session,
      sectionKey: "ngo-dashboard",
      phaseNumber: 1,
    });

    const closed = await prisma.activitySession.findUniqueOrThrow({
      where: { id: stale.id },
    });

    assert.ok(closed.endedAt);
    assert.equal(closed.isClosedByTimeout, true);
    assert.equal(closed.endedAt?.getTime(), expectedEnd.getTime());
    assert.equal(
      closed.durationMinutes,
      Math.max(1, Math.ceil((expectedEnd.getTime() - startedAt.getTime()) / 60000)),
    );
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("manual session finalization is capped at the idle timeout window", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Manual Timeout Org ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `manual-timeout-admin-${id}@example.org`,
      name: "Manual Timeout Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  const session: UserSession = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: ROLES.NGO_ADMIN,
    organizationId: organization.id,
  };

  try {
    const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastActivityAt = new Date(startedAt.getTime() + 5 * 60 * 1000);
    const expectedEnd = new Date(
      lastActivityAt.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000,
    );

    const stale = await prisma.activitySession.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        userRole: admin.role,
        phaseNumber: 1,
        sectionKey: "ngo-dashboard",
        startedAt,
        lastActivityAt,
      },
    });

    const closed = await finalizeActivitySessionById({
      session,
      sessionId: stale.id,
      closedByTimeout: false,
    });

    assert.ok(closed);
    assert.ok(closed?.endedAt);
    assert.equal(closed?.endedAt?.getTime(), expectedEnd.getTime());
    assert.equal(
      closed?.durationMinutes,
      Math.max(1, Math.ceil((expectedEnd.getTime() - startedAt.getTime()) / 60000)),
    );
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("organization metrics include gate + deliverables bottleneck signals", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Org Metrics Signals ${id}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `org-signals-admin-${id}@example.org`,
      name: "Signals Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
    },
  });

  try {
    await initializePhases(organization.id);
    await createOrRegenerateDeliverableVersion({
      organizationId: organization.id,
    });

    const metrics = await getOrganizationMetrics({
      organizationId: organization.id,
      days: 30,
      until: new Date(),
    });

    assert.equal(metrics.phase.currentPhase, 1);
    assert.equal(metrics.phase.gateStatus, "blocked");
    assert.ok(metrics.phase.gateMissingOutputs > 0);
    assert.equal(metrics.deliverables.bottleneck, "blocked_by_outputs");
    assert.equal(metrics.deliverables.pendingAction, "complete_upstream_outputs");

    await completeOutputs(organization.id, 1, admin.id);
    const refreshed = await getOrganizationMetrics({
      organizationId: organization.id,
      days: 30,
      until: new Date(),
    });
    assert.equal(refreshed.phase.gateStatus, "ready");
  } finally {
    await cleanupByOrganization(organization.id);
  }
});

test("cohort metrics expose readiness bottlenecks and progression ordering", async () => {
  const id = suffix();
  const blockedOrg = await prisma.organization.create({
    data: { name: `A Blocked Org ${id}` },
  });
  const readyOrg = await prisma.organization.create({
    data: { name: `Z Deliverables Org ${id}` },
  });
  const blockedAdmin = await prisma.user.create({
    data: {
      email: `blocked-admin-${id}@example.org`,
      name: "Blocked Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: blockedOrg.id,
    },
  });
  const readyAdmin = await prisma.user.create({
    data: {
      email: `ready-admin-${id}@example.org`,
      name: "Ready Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: readyOrg.id,
    },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `ready-facilitator-${id}@example.org`,
      name: "Ready Facilitator",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  try {
    await initializePhases(blockedOrg.id);
    await initializePhases(readyOrg.id);

    await moveOrgToDeliverablesReadyState(readyOrg.id, readyAdmin.id);
    const deliverable = await createOrRegenerateDeliverableVersion({
      organizationId: readyOrg.id,
    });
    await submitDeliverableForReview({
      organizationId: readyOrg.id,
      deliverableId: deliverable.deliverable.id,
    });
    await approveDeliverableVersion({
      organizationId: readyOrg.id,
      deliverableId: deliverable.deliverable.id,
      reviewerId: facilitator.id,
    });

    await recordTaskCompletion({
      organizationId: readyOrg.id,
      sectionKey: "deliverables",
      phaseNumber: 6,
      count: 2,
    });

    const cohort = await getCohortMetrics({ days: 30, until: new Date() });
    assert.ok(cohort.bottlenecks.blockedByGate >= 1);
    assert.ok(cohort.bottlenecks.deliverablesPending >= 1);
    const blockedOrgMetrics = cohort.organizations.find(
      (org) => org.organizationId === blockedOrg.id,
    );
    assert.ok(blockedOrgMetrics);
    assert.equal(blockedOrgMetrics.gateStatus, "blocked");

    const readyOrgMetrics = cohort.organizations.find(
      (org) => org.organizationId === readyOrg.id,
    );
    assert.equal(readyOrgMetrics?.deliverablesBottleneck, "awaiting_publication");
    assert.notEqual(readyOrgMetrics?.gateStatus, "unknown");
  } finally {
    await cleanupByOrganization(blockedOrg.id);
    await cleanupByOrganization(readyOrg.id);
    await prisma.user.deleteMany({ where: { id: blockedAdmin.id } });
    await prisma.user.deleteMany({ where: { id: readyAdmin.id } });
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("cohort metrics collapse duplicate organization names into one row", async () => {
  const id = suffix();
  const duplicateName = `Duplicate Cohort Org ${id}`;
  const orgA = await prisma.organization.create({
    data: { name: duplicateName },
  });
  const orgB = await prisma.organization.create({
    data: { name: duplicateName },
  });

  try {
    await initializePhases(orgA.id);
    await initializePhases(orgB.id);

    await recordTaskCompletion({
      organizationId: orgA.id,
      sectionKey: "cohort-dashboard",
      phaseNumber: 1,
      count: 1,
    });
    await recordTaskCompletion({
      organizationId: orgB.id,
      sectionKey: "cohort-dashboard",
      phaseNumber: 1,
      count: 1,
    });

    const cohort = await getCohortMetrics({ days: 30, until: new Date() });
    const duplicates = cohort.organizations.filter(
      (organization) => organization.organizationName === duplicateName,
    );

    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0]?.completedTasks, 2);
  } finally {
    await cleanupByOrganization(orgA.id);
    await cleanupByOrganization(orgB.id);
  }
});

test("reconcile analytics projection returns reconciliation report", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { name: `Reconcile Org ${id}` },
  });

  try {
    await initializePhases(organization.id);
    const report = await reconcileAnalyticsProjection({
      organizationId: organization.id,
    });

    assert.equal(report.organizationsProcessed, 1);
    assert.ok(typeof report.reconciledAt === "string");
    assert.ok(Array.isArray(report.warnings));
  } finally {
    await cleanupByOrganization(organization.id);
  }
});
