import { ROLES, type UserSession } from "./auth";
import { AuthorizationError } from "./access-guards";
import { writeAuditEvent, writeDeniedAccessEvent } from "./audit";
import { prisma } from "./prisma";

const STRATEGIC_COACH_VISIBLE_KEY = "strategic_coach_visible";
const EXAMPLE_LIBRARY_VISIBLE_KEY = "example_library_visible";
const WORKING_DRAFT_VISIBLE_KEY = "working_draft_visible";
const DEFAULT_STRATEGIC_COACH_VISIBLE = true;
const DEFAULT_EXAMPLE_LIBRARY_VISIBLE = true;
const DEFAULT_WORKING_DRAFT_VISIBLE = true;

export async function getStrategicCoachVisibility(): Promise<boolean> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: STRATEGIC_COACH_VISIBLE_KEY },
    select: { boolValue: true },
  });
  if (!setting || setting.boolValue === null) {
    return DEFAULT_STRATEGIC_COACH_VISIBLE;
  }
  return setting.boolValue;
}

export async function getExampleLibraryVisibility(): Promise<boolean> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: EXAMPLE_LIBRARY_VISIBLE_KEY },
    select: { boolValue: true },
  });
  if (!setting || setting.boolValue === null) {
    return DEFAULT_EXAMPLE_LIBRARY_VISIBLE;
  }
  return setting.boolValue;
}

export async function getWorkingDraftVisibility(): Promise<boolean> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: WORKING_DRAFT_VISIBLE_KEY },
    select: { boolValue: true },
  });
  if (!setting || setting.boolValue === null) {
    return DEFAULT_WORKING_DRAFT_VISIBLE;
  }
  return setting.boolValue;
}

async function assertFacilitatorWriteAccess(session: UserSession) {
  if (session.role === ROLES.FACILITATOR) {
    return;
  }

  await writeDeniedAccessEvent({
    session,
    organizationId: session.organizationId,
    targetEntityType: "platform_setting",
    targetEntityId: STRATEGIC_COACH_VISIBLE_KEY,
    reason: "platform_setting_write_forbidden",
  });

  throw new AuthorizationError(
    "Only facilitators can update platform settings.",
    "ROLE_FORBIDDEN",
    403,
  );
}

export async function setStrategicCoachVisibility(input: {
  session: UserSession;
  isVisible: boolean;
}) {
  await assertFacilitatorWriteAccess(input.session);

  const setting = await prisma.platformSetting.upsert({
    where: { key: STRATEGIC_COACH_VISIBLE_KEY },
    create: {
      key: STRATEGIC_COACH_VISIBLE_KEY,
      boolValue: input.isVisible,
    },
    update: {
      boolValue: input.isVisible,
    },
  });

  await writeAuditEvent({
    eventKey: "platform.setting.updated",
    eventType: "ops",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: null,
    targetEntityType: "platform_setting",
    targetEntityId: STRATEGIC_COACH_VISIBLE_KEY,
    metadata: {
      boolValue: setting.boolValue,
    },
  });

  return setting.boolValue ?? DEFAULT_STRATEGIC_COACH_VISIBLE;
}

export async function setExampleLibraryVisibility(input: {
  session: UserSession;
  isVisible: boolean;
}) {
  await assertFacilitatorWriteAccess(input.session);

  const setting = await prisma.platformSetting.upsert({
    where: { key: EXAMPLE_LIBRARY_VISIBLE_KEY },
    create: {
      key: EXAMPLE_LIBRARY_VISIBLE_KEY,
      boolValue: input.isVisible,
    },
    update: {
      boolValue: input.isVisible,
    },
  });

  await writeAuditEvent({
    eventKey: "platform.setting.updated",
    eventType: "ops",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: null,
    targetEntityType: "platform_setting",
    targetEntityId: EXAMPLE_LIBRARY_VISIBLE_KEY,
    metadata: {
      boolValue: setting.boolValue,
    },
  });

  return setting.boolValue ?? DEFAULT_EXAMPLE_LIBRARY_VISIBLE;
}

export async function setWorkingDraftVisibility(input: {
  session: UserSession;
  isVisible: boolean;
}) {
  await assertFacilitatorWriteAccess(input.session);

  const setting = await prisma.platformSetting.upsert({
    where: { key: WORKING_DRAFT_VISIBLE_KEY },
    create: {
      key: WORKING_DRAFT_VISIBLE_KEY,
      boolValue: input.isVisible,
    },
    update: {
      boolValue: input.isVisible,
    },
  });

  await writeAuditEvent({
    eventKey: "platform.setting.updated",
    eventType: "ops",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: null,
    targetEntityType: "platform_setting",
    targetEntityId: WORKING_DRAFT_VISIBLE_KEY,
    metadata: {
      boolValue: setting.boolValue,
    },
  });

  return setting.boolValue ?? DEFAULT_WORKING_DRAFT_VISIBLE;
}
