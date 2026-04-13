import { ROLES, type Role, type UserSession } from "./auth";
import { writeDeniedAccessEvent } from "./audit";

type AccessAction = "read" | "write";

export class AuthorizationError extends Error {
  status: 400 | 403;
  code: string;

  constructor(message: string, code: string, status: 400 | 403 = 403) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type GuardContext = {
  reason: string;
  targetEntityType?: string;
  targetEntityId?: string;
  metadata?: Record<string, unknown>;
};

async function denyWithAudit(input: {
  session: UserSession;
  organizationId?: string | null;
  context: GuardContext;
  message: string;
  code: string;
  status?: 400 | 403;
}) {
  await writeDeniedAccessEvent({
    session: input.session,
    organizationId: input.organizationId,
    targetEntityType: input.context.targetEntityType,
    targetEntityId: input.context.targetEntityId,
    reason: input.context.reason,
    metadata: {
      code: input.code,
      ...(input.context.metadata ?? {}),
    },
  });

  throw new AuthorizationError(input.message, input.code, input.status ?? 403);
}

export async function requireRole(input: {
  session: UserSession;
  roles: Role[];
  context: GuardContext;
}) {
  if (input.roles.includes(input.session.role)) {
    return;
  }

  await denyWithAudit({
    session: input.session,
    organizationId: input.session.organizationId,
    context: input.context,
    message: "Not authorized for this operation.",
    code: "ROLE_FORBIDDEN",
  });
}

export async function requireOrganizationScope(input: {
  session: UserSession;
  organizationId: string | null | undefined;
  action: AccessAction;
  allowFacilitatorWrite?: boolean;
  allowGlobalScope?: boolean;
  context: GuardContext;
}) {
  const organizationId = input.organizationId ?? null;
  if (!organizationId) {
    if (input.allowGlobalScope) {
      return;
    }
    await denyWithAudit({
      session: input.session,
      organizationId,
      context: input.context,
      message: "Organization scope is required.",
      code: "ORG_SCOPE_REQUIRED",
      status: 400,
    });
  }

  if (input.session.role === ROLES.FOCUS_COORDINATOR) {
    if (input.action === "write") {
      await denyWithAudit({
        session: input.session,
        organizationId,
        context: input.context,
        message: "focus_coordinator is read-only for organization operations.",
        code: "FOCUS_READ_ONLY",
      });
    }
    return;
  }

  if (input.session.role === ROLES.FACILITATOR) {
    if (input.action === "write" && !input.allowFacilitatorWrite) {
      await denyWithAudit({
        session: input.session,
        organizationId,
        context: input.context,
        message: "Facilitator cannot execute this write operation.",
        code: "FACILITATOR_WRITE_FORBIDDEN",
      });
    }
    return;
  }

  if (input.session.role === ROLES.NGO_ADMIN) {
    if (!input.session.organizationId || input.session.organizationId !== organizationId) {
      await denyWithAudit({
        session: input.session,
        organizationId,
        context: input.context,
        message: "Not authorized for this organization.",
        code: "ORG_SCOPE_FORBIDDEN",
      });
    }
    return;
  }

  await denyWithAudit({
    session: input.session,
    organizationId,
    context: input.context,
    message: "Unknown role authorization policy.",
    code: "UNKNOWN_ROLE",
  });
}

export async function requireReadOnlyOversight(input: {
  session: UserSession;
  organizationId?: string | null;
  context: GuardContext;
}) {
  if (input.session.role !== ROLES.FOCUS_COORDINATOR) {
    return;
  }

  await denyWithAudit({
    session: input.session,
    organizationId: input.organizationId ?? input.session.organizationId,
    context: input.context,
    message: "focus_coordinator has read-only oversight access.",
    code: "FOCUS_READ_ONLY",
  });
}
