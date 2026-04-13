import { prisma } from "./prisma";
import { ROLES, type Role, type UserSession } from "./auth";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type AuditEventType = "mutation" | "denied" | "auth" | "ops";

export type AuditEventInput = {
  eventKey: string;
  eventType?: AuditEventType;
  actorId?: string | null;
  actorRole?: Role | null;
  organizationId?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  metadata?: JsonValue;
};

export type AuditQueryFilters = {
  organizationId?: string;
  actorId?: string;
  eventKey?: string;
  eventType?: AuditEventType;
  start?: Date;
  end?: Date;
  limit?: number;
};

const MAX_METADATA_CHARS = 4_000;
const DENIED_EVENT_KEY = "security.authorization.denied";
const DENIED_REASON_METADATA_KEY = "reason";

function sanitizeMetadataValue(value: JsonValue): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  const sanitized: Record<string, JsonValue> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("password") ||
      lowered.includes("token") ||
      lowered.includes("secret") ||
      lowered.includes("hash")
    ) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeMetadataValue(nestedValue as JsonValue);
  }
  return sanitized;
}

function serializeMetadata(metadata?: JsonValue): string | null {
  if (metadata === undefined) {
    return null;
  }
  const sanitized = sanitizeMetadataValue(metadata);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_METADATA_CHARS) {
    return serialized;
  }
  return `${serialized.slice(0, MAX_METADATA_CHARS)}…`;
}

export async function writeAuditEvent(input: AuditEventInput) {
  return prisma.auditEvent.create({
    data: {
      eventKey: input.eventKey,
      eventType: input.eventType ?? "mutation",
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      organizationId: input.organizationId ?? null,
      targetEntityType: input.targetEntityType ?? null,
      targetEntityId: input.targetEntityId ?? null,
      metadataJson: serializeMetadata(input.metadata),
    },
  });
}

export async function writeDeniedAccessEvent(input: {
  session: UserSession;
  organizationId?: string | null;
  targetEntityType?: string;
  targetEntityId?: string;
  reason: string;
  metadata?: JsonValue;
}) {
  const extraMetadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as { [key: string]: JsonValue })
      : null;

  return writeAuditEvent({
    eventKey: DENIED_EVENT_KEY,
    eventType: "denied",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId ?? input.session.organizationId,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    metadata: {
      [DENIED_REASON_METADATA_KEY]: input.reason,
      ...(extraMetadata ?? {}),
      ...(extraMetadata ? {} : { details: input.metadata ?? null }),
    },
  });
}

export async function queryAuditEvents(input: {
  session: UserSession;
  filters?: AuditQueryFilters;
}) {
  const filters = input.filters ?? {};
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

  const where: {
    organizationId?: string | null;
    actorId?: string;
    eventKey?: string;
    eventType?: AuditEventType;
    createdAt?: { gte?: Date; lte?: Date };
  } = {};

  if (input.session.role === ROLES.NGO_ADMIN) {
    where.organizationId = input.session.organizationId ?? "__no_org__";
  } else if (filters.organizationId) {
    where.organizationId = filters.organizationId;
  }

  if (filters.actorId) {
    where.actorId = filters.actorId;
  }
  if (filters.eventKey) {
    where.eventKey = filters.eventKey;
  }
  if (filters.eventType) {
    where.eventType = filters.eventType;
  }
  if (filters.start || filters.end) {
    where.createdAt = {};
    if (filters.start) {
      where.createdAt.gte = filters.start;
    }
    if (filters.end) {
      where.createdAt.lte = filters.end;
    }
  }

  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    ...row,
    metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as JsonValue) : null,
  }));
}

export async function getAuthorizationDeniedSignals(input: {
  organizationId?: string | null;
  start: Date;
  end: Date;
  threshold?: number;
}) {
  const threshold = Math.max(1, input.threshold ?? 5);
  const rows = await prisma.auditEvent.findMany({
    where: {
      eventKey: DENIED_EVENT_KEY,
      organizationId: input.organizationId ?? undefined,
      createdAt: {
        gte: input.start,
        lte: input.end,
      },
    },
    select: {
      actorId: true,
      organizationId: true,
    },
  });

  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.organizationId ?? "global"}:${row.actorId ?? "unknown"}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .filter(([, count]) => count >= threshold)
    .map(([scope, count]) => ({ scope, count }));
}
