import assert from "node:assert/strict";
import test from "node:test";
import {
  loadHardeningOrganizationFixtures,
  seedHardeningFixtures,
} from "./hardening-fixtures.ts";
import { prisma } from "./prisma.ts";

const runHardeningFixtureTests = process.env.RUN_HARDENING_FIXTURE_TESTS === "true";
const fixtureTest = runHardeningFixtureTests ? test : test.skip;

async function cleanupHardeningFixtures() {
  await prisma.authSession.deleteMany({
    where: {
      OR: [
        { user: { username: { startsWith: "facilitator-hardening" } } },
        { user: { username: { startsWith: "focus-hardening" } } },
        { user: { organizationId: { startsWith: "org-hardening-" } } },
      ],
    },
  });
  await prisma.activitySession.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.sectionEngagement.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.deliverable.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.diagnosisSurveyResponse.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.roiBenchmarkChange.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.roiSnapshot.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.roiSetting.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  await prisma.phaseOutputCompletion.deleteMany({
    where: {
      phase: { phaseTracker: { organizationId: { startsWith: "org-hardening-" } } },
    },
  });
  await prisma.phaseReview.deleteMany({
    where: {
      phase: { phaseTracker: { organizationId: { startsWith: "org-hardening-" } } },
    },
  });
  await prisma.phase.deleteMany({
    where: {
      phaseTracker: { organizationId: { startsWith: "org-hardening-" } },
    },
  });
  await prisma.phaseTracker.deleteMany({
    where: { organizationId: { startsWith: "org-hardening-" } },
  });
  // Keep deterministic fixture organizations/users to avoid FK cleanup races with
  // local exploratory records; seedHardeningFixtures() upserts these identities.
}

fixtureTest("hardening fixtures load deterministic organizations from CSV", async () => {
  const fixtures = await loadHardeningOrganizationFixtures();
  assert.equal(fixtures.length, 10);
  assert.equal(fixtures[0]?.id, "org-hardening-01");
  assert.ok(fixtures[0]?.country.length);
  assert.ok(fixtures[0]?.adminUsername.endsWith("-admin"));
});

fixtureTest("hardening fixture seed writes organizations, country metadata, and users", async () => {
  await cleanupHardeningFixtures();
  try {
    const seeded = await seedHardeningFixtures();
    assert.equal(seeded.organizations.length, 10);
    assert.ok(seeded.facilitatorId);
    assert.ok(seeded.coordinatorId);

    const firstOrg = await prisma.organization.findUnique({
      where: { id: "org-hardening-01" },
      select: { id: true, country: true, name: true },
    });
    assert.ok(firstOrg);
    assert.ok(firstOrg?.country);

    const adminUsernames = seeded.organizations.map((organization) => organization.adminUsername);
    const ngoAdminUsers = await prisma.user.findMany({
      where: { username: { in: adminUsernames } },
      select: { id: true, username: true, role: true },
    });
    assert.equal(ngoAdminUsers.length, 10);
    assert.ok(ngoAdminUsers.every((user) => user.role === "ngo_admin"));
  } finally {
    await cleanupHardeningFixtures();
  }
});

fixtureTest("hardening fixture smoke verifies org and role identity coverage", async () => {
  await cleanupHardeningFixtures();
  try {
    const seeded = await seedHardeningFixtures();
    assert.equal(seeded.organizations.length, 10);

    for (const organization of seeded.organizations) {
      const tracker = await prisma.phaseTracker.findUnique({
        where: { organizationId: organization.id },
        select: { id: true },
      });
      assert.ok(tracker, `missing phase tracker for ${organization.id}`);

      const admin = await prisma.user.findUnique({
        where: { username: organization.adminUsername },
        select: { role: true, organizationId: true },
      });
      assert.ok(admin, `missing ngo_admin for ${organization.id}`);
      assert.equal(admin?.role, "ngo_admin");
      assert.equal(admin?.organizationId, organization.id);
    }

    const facilitator = await prisma.user.findUnique({
      where: { username: "facilitator-hardening" },
      select: { role: true, organizationId: true },
    });
    const coordinator = await prisma.user.findUnique({
      where: { username: "focus-hardening" },
      select: { role: true, organizationId: true },
    });
    assert.equal(facilitator?.role, "facilitator");
    assert.equal(facilitator?.organizationId, null);
    assert.equal(coordinator?.role, "focus_coordinator");
    assert.equal(coordinator?.organizationId, null);
  } finally {
    await cleanupHardeningFixtures();
  }
});
