import { cookies } from "next/headers";
import { type UserSession, ROLES } from "./auth";
import { SESSION_COOKIE_NAME, resolveUserSessionFromToken } from "./auth-service";
import { prisma } from "./prisma";
import { initializePhases } from "./phases";

type MockSessionSeed = Omit<
  UserSession,
  "authSessionId" | "mustChangePassword" | "isActive" | "authMode"
> & {
  username: string;
};

const MOCK_USERS: Record<string, MockSessionSeed> = {
  "ngo-admin": {
    id: "mock-user-001",
    username: "bien-de-mujer-admin",
    email: "bien-de-mujer-admin",
    name: "Bien de Mujer Admin",
    role: ROLES.NGO_ADMIN,
    organizationId: "org-001",
  },
  facilitator: {
    id: "mock-user-003",
    username: "facilitator",
    email: "facilitator",
    name: "Facilitator",
    role: ROLES.FACILITATOR,
    organizationId: "org-001",
  },
  coordinator: {
    id: "mock-user-004",
    username: "focus",
    email: "focus",
    name: "Focus Coordinator",
    role: ROLES.FOCUS_COORDINATOR,
    organizationId: null,
  },
};

const ACTIVE_MOCK_USER = process.env.MOCK_USER ?? "ngo-admin";
const MOCK_FALLBACK_REQUESTED = process.env.AUTH_ALLOW_MOCK_FALLBACK === "true";
if (process.env.NODE_ENV === "production" && MOCK_FALLBACK_REQUESTED) {
  throw new Error("AUTH_ALLOW_MOCK_FALLBACK must be false in production.");
}
const ALLOW_MOCK_FALLBACK =
  MOCK_FALLBACK_REQUESTED && process.env.NODE_ENV !== "production";
const AUTH_REQUIRED_MESSAGE = "Authentication required.";

async function ensureMockOrganization(preferredOrganizationId: string): Promise<string> {
  const preferred = await prisma.organization.findUnique({
    where: { id: preferredOrganizationId },
    select: { id: true },
  });
  if (preferred) {
    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: preferred.id },
      select: { id: true },
    });
    if (!tracker) {
      await initializePhases(preferred.id);
    }
    return preferred.id;
  }

  const firstOrganization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (firstOrganization) {
    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: firstOrganization.id },
      select: { id: true },
    });
    if (!tracker) {
      await initializePhases(firstOrganization.id);
    }
    return firstOrganization.id;
  }

  const created = await prisma.organization.create({
    data: {
      id: preferredOrganizationId,
      name: "Demo NGO Organization",
      description: "Auto-created local development organization.",
    },
    select: { id: true },
  });
  await initializePhases(created.id);
  return created.id;
}

async function ensureMockUser(session: MockSessionSeed): Promise<UserSession> {
  const persisted = await prisma.user.upsert({
    where: { username: session.username },
    create: {
      id: session.id,
      email: session.email,
      username: session.username,
      name: session.name,
      role: session.role,
      organizationId: session.organizationId,
      passwordHash: null,
      mustChangePassword: false,
      isActive: true,
    },
    update: {
      name: session.name,
      email: session.email,
      username: session.username,
      role: session.role,
      organizationId: session.organizationId,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      mustChangePassword: true,
      isActive: true,
    },
  });

  return {
    id: persisted.id,
    email: persisted.email,
    name: persisted.name,
    role: persisted.role as UserSession["role"],
    organizationId: persisted.organizationId,
    authSessionId: null,
    mustChangePassword: persisted.mustChangePassword,
    isActive: persisted.isActive,
    authMode: "mock",
  };
}

async function resolveMockSession(): Promise<UserSession> {
  const selected = MOCK_USERS[ACTIVE_MOCK_USER] ?? MOCK_USERS["ngo-admin"];
  const organizationId = selected.organizationId
    ? await ensureMockOrganization(selected.organizationId)
    : null;
  return ensureMockUser({ ...selected, organizationId });
}

async function resolveCredentialSessionFromCookies(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return resolveUserSessionFromToken(token);
}

export async function getSession(): Promise<UserSession> {
  const credentialSession = await resolveCredentialSessionFromCookies();
  if (credentialSession) {
    return credentialSession;
  }

  if (ALLOW_MOCK_FALLBACK) {
    return resolveMockSession();
  }

  throw new Error(AUTH_REQUIRED_MESSAGE);
}

export async function getSessionOrNull(): Promise<UserSession | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

export function isAuthenticationRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === AUTH_REQUIRED_MESSAGE;
}
