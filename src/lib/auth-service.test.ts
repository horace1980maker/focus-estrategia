import assert from "node:assert/strict";
import test from "node:test";
import { ROLES, type UserSession } from "./auth.ts";
import {
  AUTH_SESSION_TTL_HOURS,
  authenticateWithCredentials,
  changeUserPassword,
  provisionUserAccount,
  revokeAuthSessionToken,
  resolveUserSessionFromToken,
} from "./auth-service.ts";
import { startOrResumeActivitySession } from "./analytics.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupOrganization(organizationId: string) {
  const phaseTracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true },
  });

  if (phaseTracker?.id) {
    await prisma.phaseOutputCompletion.deleteMany({
      where: { phase: { phaseTrackerId: phaseTracker.id } },
    });
    await prisma.phaseReview.deleteMany({
      where: { phase: { phaseTrackerId: phaseTracker.id } },
    });
    await prisma.phase.deleteMany({ where: { phaseTrackerId: phaseTracker.id } });
    await prisma.phaseTracker.delete({ where: { id: phaseTracker.id } });
  }

  await prisma.activitySession.deleteMany({
    where: { organizationId },
  });
  await prisma.sectionEngagement.deleteMany({
    where: { organizationId },
  });
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

test("provisioned users can login with username and rotate first-login password", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: {
      id: `org-auth-${id}`,
      name: `Auth Org ${id}`,
      country: "Guatemala",
    },
  });

  const facilitator = await prisma.user.create({
    data: {
      email: `fac-${id}@internal.local`,
      username: `fac-${id}`,
      name: "Facilitator",
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

  const username = `org-${id}-admin`;

  try {
    const provisioned = await provisionUserAccount({
      actor: facilitatorSession,
      username,
      email: null,
      name: "Org Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "TempPass123!",
      mustChangePassword: true,
    });

    assert.equal(provisioned.username, username);
    assert.equal(provisioned.email, username);

    const login = await authenticateWithCredentials({
      username,
      password: "TempPass123!",
    });
    assert.ok(login.token.length > 10);
    assert.equal(login.user.id, provisioned.id);
    assert.equal(login.authSession.expiresAt > new Date(), true);

    const resolved = await resolveUserSessionFromToken(login.token);
    assert.ok(resolved);
    assert.equal(resolved?.id, provisioned.id);
    assert.equal(resolved?.organizationId, organization.id);
    assert.equal(resolved?.mustChangePassword, true);

    await changeUserPassword({
      session: {
        id: provisioned.id,
        email: provisioned.email,
        name: provisioned.name,
        role: ROLES.NGO_ADMIN,
        organizationId: organization.id,
      },
      newPassword: "NewPass123!",
    });

    const relogin = await authenticateWithCredentials({
      username,
      password: "NewPass123!",
    });
    assert.equal(relogin.user.id, provisioned.id);
    assert.equal(relogin.user.mustChangePassword, false);
    assert.equal(AUTH_SESSION_TTL_HOURS >= 1, true);
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("invalid credentials trigger lockout after repeated failures", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: {
      id: `org-lock-${id}`,
      name: `Lockout Org ${id}`,
      country: "Honduras",
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `lock-${id}@internal.local`,
      username: `lock-${id}`,
      name: "Lockout User",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      passwordHash: "v1:abcdef:abcdef",
      mustChangePassword: false,
      failedLoginAttempts: 4,
    },
  });

  try {
    await assert.rejects(
      () =>
        authenticateWithCredentials({
          username: user.username ?? user.email,
          password: "invalid-password",
        }),
      /Invalid credentials/,
    );

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });

    assert.equal(updated?.failedLoginAttempts, 5);
    assert.ok(updated?.lockedUntil);
  } finally {
    await cleanupOrganization(organization.id);
  }
});

test("facilitator reprovisioning updates existing org-admin credentials", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: {
      id: `org-reprovision-${id}`,
      name: `Reprovision Org ${id}`,
      country: "Guatemala",
    },
  });

  const facilitator = await prisma.user.create({
    data: {
      email: `fac-reprovision-${id}@internal.local`,
      username: `fac-reprovision-${id}`,
      name: "Facilitator Reprovision",
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

  const username = `org-reprovision-${id}-admin`;

  try {
    const first = await provisionUserAccount({
      actor: facilitatorSession,
      username,
      email: null,
      name: "Org Admin Initial",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "FirstPass123!",
      mustChangePassword: true,
    });

    await prisma.user.update({
      where: { id: first.id },
      data: {
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60_000),
      },
    });

    const reprovisioned = await provisionUserAccount({
      actor: facilitatorSession,
      username,
      email: null,
      name: "Org Admin Updated",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "SecondPass123!",
      mustChangePassword: true,
    });

    assert.equal(reprovisioned.id, first.id);
    assert.equal(reprovisioned.name, "Org Admin Updated");
    assert.equal(reprovisioned.failedLoginAttempts, 0);
    assert.equal(reprovisioned.lockedUntil, null);
    assert.equal(reprovisioned.passwordVersion >= 2, true);

    await assert.rejects(
      () =>
        authenticateWithCredentials({
          username,
          password: "FirstPass123!",
        }),
      /Invalid credentials/,
    );

    const login = await authenticateWithCredentials({
      username,
      password: "SecondPass123!",
    });
    assert.equal(login.user.id, first.id);
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});

test("logout finalizes open activity sessions before the cookie is cleared", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: {
      id: `org-logout-${id}`,
      name: `Logout Org ${id}`,
      country: "Guatemala",
    },
  });

  const facilitator = await prisma.user.create({
    data: {
      email: `fac-logout-${id}@internal.local`,
      username: `fac-logout-${id}`,
      name: "Facilitator Logout",
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

  const username = `org-logout-${id}-admin`;

  try {
    await provisionUserAccount({
      actor: facilitatorSession,
      username,
      email: null,
      name: "Org Admin Logout",
      role: ROLES.NGO_ADMIN,
      organizationId: organization.id,
      password: "LogoutPass123!",
      mustChangePassword: false,
    });

    const login = await authenticateWithCredentials({
      username,
      password: "LogoutPass123!",
    });
    const session = await resolveUserSessionFromToken(login.token);

    assert.ok(session);

    const activity = await startOrResumeActivitySession({
      session: session!,
      sectionKey: "ngo-dashboard",
      phaseNumber: 1,
    });

    await revokeAuthSessionToken({
      token: login.token,
      reason: "user_requested",
    });

    const finalizedSession = await prisma.activitySession.findUnique({
      where: { id: activity.id },
    });
    const engagement = await prisma.sectionEngagement.findFirst({
      where: {
        organizationId: organization.id,
        sectionKey: "ngo-dashboard",
        phaseNumber: 1,
      },
    });

    assert.ok(finalizedSession?.endedAt);
    assert.ok((finalizedSession?.durationMinutes ?? 0) >= 1);
    assert.ok((engagement?.totalMinutes ?? 0) >= 1);
  } finally {
    await cleanupOrganization(organization.id);
    await prisma.user.deleteMany({ where: { id: facilitator.id } });
  }
});
