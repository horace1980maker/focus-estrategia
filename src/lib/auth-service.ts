import { prisma } from "./prisma";
import { ROLES, type Role, type UserSession } from "./auth";
import { writeAuditEvent } from "./audit";
import { initializePhases } from "./phases";
import { createSessionToken, hashPassword, sha256Hex, verifyPassword } from "./security";

export const SESSION_COOKIE_NAME = "saw_session";
export const AUTH_SESSION_TTL_HOURS = Math.max(
  1,
  Number(process.env.AUTH_SESSION_TTL_HOURS ?? "12"),
);
export const MAX_FAILED_LOGIN_ATTEMPTS = Math.max(
  1,
  Number(process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS ?? "5"),
);
export const LOGIN_LOCKOUT_MINUTES = Math.max(
  1,
  Number(process.env.AUTH_LOGIN_LOCKOUT_MINUTES ?? "15"),
);

const INVALID_CREDENTIALS_MESSAGE = "Invalid credentials.";
const DUMMY_PASSWORD_HASH = hashPassword("not-a-real-password");

export class AuthServiceError extends Error {
  status: 400 | 401 | 403 | 404 | 409;
  code: string;

  constructor(
    message: string,
    code: string,
    status: 400 | 401 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getSessionExpiry(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + AUTH_SESSION_TTL_HOURS);
  return expiresAt;
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function sanitizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function shouldRefreshLastSeen(lastSeenAt: Date): boolean {
  const diff = Date.now() - lastSeenAt.getTime();
  return diff > 5 * 60 * 1000;
}

async function ensureOrganizationPhaseTracker(organizationId: string) {
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (tracker) {
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    return;
  }

  try {
    await initializePhases(organizationId);
  } catch {
    // Concurrent login/bootstrap flows can race. Subsequent reads self-heal.
  }
}

async function createAuthSession(input: {
  userId: string;
  organizationContextId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = createSessionToken();
  const tokenHash = sha256Hex(token);

  const session = await prisma.authSession.create({
    data: {
      userId: input.userId,
      tokenHash,
      organizationContextId: input.organizationContextId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: getSessionExpiry(),
    },
  });

  return { token, session };
}

async function recordLoginFailure(input: {
  userId?: string;
  role?: Role;
  organizationId?: string | null;
  username: string;
  reason: string;
}) {
  await writeAuditEvent({
    eventKey: "auth.login.failed",
    eventType: "auth",
    actorId: input.userId ?? null,
    actorRole: input.role ?? null,
    organizationId: input.organizationId ?? null,
    targetEntityType: "user",
    targetEntityId: input.userId ?? null,
    metadata: {
      username: input.username,
      reason: input.reason,
    },
  });
}

async function assertProvisioningPermissions(input: {
  actor: UserSession;
  role: Role;
  organizationId: string | null;
}) {
  const { actor, role, organizationId } = input;

  if (actor.role === ROLES.FOCUS_COORDINATOR) {
    throw new AuthServiceError(
      "focus_coordinator cannot provision users.",
      "ROLE_FORBIDDEN",
      403,
    );
  }

  if (actor.role === ROLES.NGO_ADMIN) {
    if (role !== ROLES.NGO_ADMIN) {
      throw new AuthServiceError(
        "ngo_admin can only provision ngo_admin users.",
        "ROLE_FORBIDDEN",
        403,
      );
    }
    if (!actor.organizationId || organizationId !== actor.organizationId) {
      throw new AuthServiceError(
        "ngo_admin can only provision users for its own organization.",
        "ORG_SCOPE_FORBIDDEN",
        403,
      );
    }
    return;
  }

  if (actor.role === ROLES.FACILITATOR) {
    if (role === ROLES.NGO_ADMIN && !organizationId) {
      throw new AuthServiceError(
        "ngo_admin users must include organizationId.",
        "ORG_SCOPE_REQUIRED",
        400,
      );
    }
    if ((role === ROLES.FACILITATOR || role === ROLES.FOCUS_COORDINATOR) && organizationId) {
      throw new AuthServiceError(
        `${role} users must not be bound to a single organization.`,
        "ORG_SCOPE_INVALID",
        400,
      );
    }
    return;
  }

  throw new AuthServiceError("Unsupported provisioning role.", "ROLE_FORBIDDEN", 403);
}

export async function authenticateWithCredentials(input: {
  username: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const username = sanitizeUsername(input.username);
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: {
      username,
    },
  });

  if (!user || !user.passwordHash || !user.isActive) {
    verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await recordLoginFailure({
      username,
      reason: "user_not_found_or_inactive",
    });
    throw new AuthServiceError(
      INVALID_CREDENTIALS_MESSAGE,
      "INVALID_CREDENTIALS",
      401,
    );
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await recordLoginFailure({
      userId: user.id,
      role: user.role as Role,
      organizationId: user.organizationId,
      username,
      reason: "locked_out",
    });
    throw new AuthServiceError(
      INVALID_CREDENTIALS_MESSAGE,
      "INVALID_CREDENTIALS",
      401,
    );
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    const nextAttempts = user.failedLoginAttempts + 1;
    const lockoutReached = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const lockedUntil = lockoutReached
      ? new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60_000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: nextAttempts,
        lastFailedLoginAt: now,
        lockedUntil,
      },
    });

    await recordLoginFailure({
      userId: user.id,
      role: user.role as Role,
      organizationId: user.organizationId,
      username,
      reason: lockoutReached ? "invalid_password_lockout" : "invalid_password",
    });

    throw new AuthServiceError(
      INVALID_CREDENTIALS_MESSAGE,
      "INVALID_CREDENTIALS",
      401,
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
      lastLoginAt: now,
      lastLoginIp: input.ipAddress ?? null,
      lastLoginUserAgent: input.userAgent ?? null,
    },
  });

  if (updatedUser.role === ROLES.NGO_ADMIN && updatedUser.organizationId) {
    await ensureOrganizationPhaseTracker(updatedUser.organizationId);
  }

  const { token, session } = await createAuthSession({
    userId: user.id,
    organizationContextId: user.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await writeAuditEvent({
    eventKey: "auth.login.success",
    eventType: "auth",
    actorId: updatedUser.id,
    actorRole: updatedUser.role as Role,
    organizationId: updatedUser.organizationId,
    targetEntityType: "auth_session",
    targetEntityId: session.id,
  });

  return {
    token,
    user: updatedUser,
    authSession: session,
  };
}

export async function revokeAuthSessionToken(input: {
  token: string;
  reason?: string;
}) {
  const tokenHash = sha256Hex(input.token);
  const authSession = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!authSession || authSession.revokedAt) {
    return;
  }

  await prisma.authSession.update({
    where: { id: authSession.id },
    data: { revokedAt: new Date() },
  });

  await writeAuditEvent({
    eventKey: "auth.logout",
    eventType: "auth",
    actorId: authSession.userId,
    actorRole: authSession.user.role as Role,
    organizationId: authSession.organizationContextId ?? authSession.user.organizationId,
    targetEntityType: "auth_session",
    targetEntityId: authSession.id,
    metadata: {
      reason: input.reason ?? "user_requested",
    },
  });
}

export async function resolveUserSessionFromToken(
  token: string,
): Promise<UserSession | null> {
  const tokenHash = sha256Hex(token);
  const now = new Date();
  const authSession = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!authSession || authSession.revokedAt || authSession.expiresAt <= now) {
    return null;
  }

  if (!authSession.user.isActive) {
    return null;
  }

  if (shouldRefreshLastSeen(authSession.lastSeenAt)) {
    await prisma.authSession.update({
      where: { id: authSession.id },
      data: { lastSeenAt: now },
    });
  }

  let organizationId: string | null = authSession.user.organizationId;

  if (authSession.user.role === ROLES.FACILITATOR) {
    organizationId = authSession.organizationContextId ?? authSession.user.organizationId;

    const validContextOrg = organizationId
      ? await prisma.organization.findFirst({
          where: {
            id: organizationId,
            users: { some: { role: ROLES.NGO_ADMIN, isActive: true } },
          },
          select: { id: true },
        })
      : null;

    if (!validContextOrg) {
      const firstOrgWithAdmins = await prisma.organization.findFirst({
        where: {
          users: { some: { role: ROLES.NGO_ADMIN, isActive: true } },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const fallbackOrg =
        firstOrgWithAdmins ??
        (await prisma.organization.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        }));

      organizationId = fallbackOrg?.id ?? null;
      await prisma.authSession.update({
        where: { id: authSession.id },
        data: { organizationContextId: organizationId },
      });
    }
  }

  if (authSession.user.role === ROLES.FOCUS_COORDINATOR) {
    organizationId = authSession.organizationContextId ?? null;
  }

  return {
    id: authSession.user.id,
    email: authSession.user.email,
    name: authSession.user.name,
    role: authSession.user.role as Role,
    organizationId,
    authSessionId: authSession.id,
    mustChangePassword: authSession.user.mustChangePassword,
    isActive: authSession.user.isActive,
    authMode: "credentials",
  };
}

export async function provisionUserAccount(input: {
  actor: UserSession;
  email?: string | null;
  name: string;
  role: Role;
  organizationId?: string | null;
  username: string;
  password: string;
  mustChangePassword?: boolean;
}) {
  const username = normalizeUsername(input.username);
  const email = input.email ? normalizeEmail(input.email) : username;
  const organizationId = input.organizationId ?? null;
  const role = input.role;

  await assertProvisioningPermissions({
    actor: input.actor,
    role,
    organizationId,
  });

  if (organizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new AuthServiceError("Organization not found.", "ORG_NOT_FOUND", 404);
    }
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
    select: { id: true },
  });
  if (existing) {
    throw new AuthServiceError("User already exists.", "USER_EXISTS", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: input.name.trim(),
      role,
      organizationId,
      passwordHash: hashPassword(input.password),
      mustChangePassword: input.mustChangePassword ?? true,
      passwordVersion: 1,
      isActive: true,
      provisionedById: input.actor.id,
    },
  });

  await writeAuditEvent({
    eventKey: "auth.user.provisioned",
    eventType: "auth",
    actorId: input.actor.id,
    actorRole: input.actor.role,
    organizationId: organizationId ?? input.actor.organizationId,
    targetEntityType: "user",
    targetEntityId: user.id,
    metadata: {
      role,
      username,
      mustChangePassword: user.mustChangePassword,
      targetOrganizationId: organizationId,
    },
  });

  return user;
}

export async function changeUserPassword(input: {
  session: UserSession;
  currentPassword?: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.session.id },
  });
  if (!user || !user.passwordHash) {
    throw new AuthServiceError("User password credentials not found.", "USER_NOT_FOUND", 404);
  }

  const isFirstLoginChange = user.mustChangePassword;
  if (!isFirstLoginChange) {
    if (!input.currentPassword || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new AuthServiceError("Current password is invalid.", "INVALID_CURRENT_PASSWORD", 401);
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(input.newPassword),
      passwordVersion: { increment: 1 },
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
    },
  });

  await writeAuditEvent({
    eventKey: "auth.password.changed",
    eventType: "auth",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.session.organizationId,
    targetEntityType: "user",
    targetEntityId: updated.id,
    metadata: {
      firstLogin: isFirstLoginChange,
    },
  });

  return updated;
}

export async function switchSessionOrganizationContext(input: {
  session: UserSession;
  organizationId: string;
}) {
  if (!input.session.authSessionId) {
    throw new AuthServiceError(
      "Cannot switch context for mock sessions.",
      "MOCK_CONTEXT_FORBIDDEN",
      403,
    );
  }

  if (input.session.role !== ROLES.FACILITATOR && input.session.role !== ROLES.FOCUS_COORDINATOR) {
    throw new AuthServiceError(
      "Only facilitator and focus_coordinator can switch organization context.",
      "ROLE_FORBIDDEN",
      403,
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true },
  });
  if (!organization) {
    throw new AuthServiceError("Organization not found.", "ORG_NOT_FOUND", 404);
  }

  await prisma.authSession.update({
    where: { id: input.session.authSessionId },
    data: {
      organizationContextId: organization.id,
      lastSeenAt: new Date(),
    },
  });

  await writeAuditEvent({
    eventKey: "auth.context.switch",
    eventType: "auth",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: organization.id,
    targetEntityType: "organization",
    targetEntityId: organization.id,
  });

  return organization.id;
}
