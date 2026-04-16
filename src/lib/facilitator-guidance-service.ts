import { ROLES, type UserSession } from "./auth";
import { AuthorizationError, requireOrganizationScope } from "./access-guards";
import { writeAuditEvent, writeDeniedAccessEvent } from "./audit";
import { prisma } from "./prisma";

export const DEFAULT_FACILITATOR_NAME = "Horacio Narváez-Mena";

type GuidanceTaskInput = {
  text: string;
  status: "current" | "pending";
  orderIndex: number;
};

function normalizeTaskLines(raw: string, status: "current" | "pending"): GuidanceTaskInput[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      text: line,
      status,
      orderIndex: index,
    }));
}

async function assertReadAccess(session: UserSession, organizationId: string) {
  await requireOrganizationScope({
    session,
    organizationId,
    action: "read",
    context: {
      reason: "facilitator_guidance_read_forbidden",
      targetEntityType: "facilitator_guidance",
      targetEntityId: organizationId,
    },
  });
}

async function assertWriteAccess(session: UserSession, organizationId: string) {
  if (session.role !== ROLES.FACILITATOR) {
    await writeDeniedAccessEvent({
      session,
      organizationId,
      targetEntityType: "facilitator_guidance",
      reason: "facilitator_guidance_write_forbidden",
    });
    throw new AuthorizationError(
      "Only facilitators can update organization guidance.",
      "ROLE_FORBIDDEN",
      403,
    );
  }

  await requireOrganizationScope({
    session,
    organizationId,
    action: "write",
    allowFacilitatorWrite: true,
    context: {
      reason: "facilitator_guidance_scope_forbidden",
      targetEntityType: "facilitator_guidance",
      targetEntityId: organizationId,
    },
  });
}

export async function getOrganizationGuidance(input: {
  session: UserSession;
  organizationId: string;
}) {
  await assertReadAccess(input.session, input.organizationId);

  const guidance = await prisma.facilitatorGuidance.findUnique({
    where: { organizationId: input.organizationId },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!guidance) {
    return {
      facilitatorName: DEFAULT_FACILITATOR_NAME,
      message: "",
      currentTasks: [] as string[],
      pendingTasks: [] as string[],
      updatedAt: null as Date | null,
    };
  }

  return {
    facilitatorName: guidance.facilitatorName || DEFAULT_FACILITATOR_NAME,
    message: guidance.message ?? "",
    currentTasks: guidance.tasks
      .filter((task) => task.status === "current")
      .map((task) => task.text),
    pendingTasks: guidance.tasks
      .filter((task) => task.status === "pending")
      .map((task) => task.text),
    updatedAt: guidance.updatedAt,
  };
}

export async function upsertOrganizationGuidance(input: {
  session: UserSession;
  organizationId: string;
  facilitatorName: string;
  message: string;
  currentTasksRaw: string;
  pendingTasksRaw: string;
}) {
  await assertWriteAccess(input.session, input.organizationId);
  const facilitatorName = input.facilitatorName.trim() || DEFAULT_FACILITATOR_NAME;
  const message = input.message.trim();
  const currentTasks = normalizeTaskLines(input.currentTasksRaw, "current");
  const pendingTasks = normalizeTaskLines(input.pendingTasksRaw, "pending");
  const tasks = [...currentTasks, ...pendingTasks];

  const guidance = await prisma.$transaction(async (tx) => {
    const record = await tx.facilitatorGuidance.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        facilitatorName,
        message: message.length > 0 ? message : null,
        updatedById: input.session.id,
      },
      update: {
        facilitatorName,
        message: message.length > 0 ? message : null,
        updatedById: input.session.id,
      },
    });

    await tx.facilitatorGuidanceTask.deleteMany({
      where: { guidanceId: record.id },
    });

    if (tasks.length > 0) {
      await tx.facilitatorGuidanceTask.createMany({
        data: tasks.map((task) => ({
          guidanceId: record.id,
          status: task.status,
          text: task.text,
          orderIndex: task.orderIndex,
        })),
      });
    }

    return record;
  });

  await writeAuditEvent({
    eventKey: "facilitator.guidance.updated",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "facilitator_guidance",
    targetEntityId: guidance.id,
    metadata: {
      currentTaskCount: currentTasks.length,
      pendingTaskCount: pendingTasks.length,
    },
  });

  return guidance;
}

