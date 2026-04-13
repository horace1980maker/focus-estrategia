import assert from "node:assert/strict";
import test from "node:test";
import * as auditEventsRoute from "../app/api/audit/events/route.ts";
import * as auditTriageRoute from "../app/api/audit/triage/route.ts";
import { ROLES, type Role, type UserSession } from "./auth.ts";
import {
  getAuthorizationDeniedSignals,
  queryAuditEvents,
  writeAuditEvent,
  writeDeniedAccessEvent,
} from "./audit.ts";
import { prisma } from "./prisma.ts";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

async function cleanupAuditFixtures(input: {
  organizationIds?: string[];
  userIds?: string[];
}) {
  const organizationIds = input.organizationIds ?? [];
  const userIds = input.userIds ?? [];

  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (organizationIds.length > 0) {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }
}

test("writeAuditEvent stores mutation events with sanitized metadata", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-audit-mutation-${id}`, name: `Audit Mutation Org ${id}` },
  });
  const actor = await prisma.user.create({
    data: {
      email: `audit-mutation-${id}@example.org`,
      name: "Audit Mutation Actor",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  try {
    const created = await writeAuditEvent({
      eventKey: "phase.review.approved",
      eventType: "mutation",
      actorId: actor.id,
      actorRole: actor.role as Role,
      organizationId: organization.id,
      targetEntityType: "phase",
      targetEntityId: "2",
      metadata: {
        note: "approved-with-feedback",
        password: "do-not-store",
        nested: { apiToken: "secret-token", safe: "keep-me" },
      },
    });

    const persisted = await prisma.auditEvent.findUnique({
      where: { id: created.id },
    });

    assert.ok(persisted);
    assert.equal(persisted?.eventType, "mutation");
    assert.equal(persisted?.eventKey, "phase.review.approved");
    assert.ok(persisted?.metadataJson);

    const metadata = JSON.parse(persisted?.metadataJson ?? "{}") as {
      note?: string;
      password?: string;
      nested?: { apiToken?: string; safe?: string };
    };

    assert.equal(metadata.note, "approved-with-feedback");
    assert.equal(metadata.password, "[redacted]");
    assert.equal(metadata.nested?.apiToken, "[redacted]");
    assert.equal(metadata.nested?.safe, "keep-me");
  } finally {
    await cleanupAuditFixtures({
      organizationIds: [organization.id],
      userIds: [actor.id],
    });
  }
});

test("audit denied events are queryable with filters and NGO scoping", async () => {
  const id = suffix();
  const orgA = await prisma.organization.create({
    data: { id: `org-audit-a-${id}`, name: `Audit Org A ${id}` },
  });
  const orgB = await prisma.organization.create({
    data: { id: `org-audit-b-${id}`, name: `Audit Org B ${id}` },
  });

  const ngoAdmin = await prisma.user.create({
    data: {
      email: `audit-ngo-${id}@example.org`,
      name: "Audit NGO Admin",
      role: ROLES.NGO_ADMIN,
      organizationId: orgA.id,
    },
  });
  const facilitator = await prisma.user.create({
    data: {
      email: `audit-fac-${id}@example.org`,
      name: "Audit Facilitator",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  const ngoSession: UserSession = {
    id: ngoAdmin.id,
    email: ngoAdmin.email,
    name: ngoAdmin.name,
    role: ROLES.NGO_ADMIN,
    organizationId: orgA.id,
  };
  const facilitatorSession: UserSession = {
    id: facilitator.id,
    email: facilitator.email,
    name: facilitator.name,
    role: ROLES.FACILITATOR,
    organizationId: null,
  };

  try {
    await writeAuditEvent({
      eventKey: "phase.review.requested",
      eventType: "mutation",
      actorId: ngoAdmin.id,
      actorRole: ngoAdmin.role as Role,
      organizationId: orgA.id,
      targetEntityType: "phase",
      targetEntityId: "1",
      metadata: { channel: "ngo_workspace" },
    });

    await writeDeniedAccessEvent({
      session: ngoSession,
      organizationId: orgA.id,
      targetEntityType: "phase_output",
      targetEntityId: "2:ngo-only",
      reason: "ngo_scope_forbidden",
      metadata: { requestedOrganizationId: orgB.id },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await writeDeniedAccessEvent({
        session: facilitatorSession,
        organizationId: orgB.id,
        targetEntityType: "roi_setting",
        reason: "facilitator_write_forbidden",
        metadata: { attempt },
      });
    }

    const orgBDenials = await queryAuditEvents({
      session: facilitatorSession,
      filters: {
        organizationId: orgB.id,
        eventType: "denied",
        eventKey: "security.authorization.denied",
        limit: 20,
      },
    });

    assert.ok(orgBDenials.length >= 3);
    assert.equal(orgBDenials.every((event) => event.organizationId === orgB.id), true);
    assert.equal(orgBDenials.every((event) => event.eventType === "denied"), true);

    const ngoScopedView = await queryAuditEvents({
      session: ngoSession,
      filters: { limit: 50 },
    });
    assert.ok(ngoScopedView.length >= 2);
    assert.equal(ngoScopedView.every((event) => event.organizationId === orgA.id), true);
    assert.equal(ngoScopedView.some((event) => event.organizationId === orgB.id), false);

    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000);
    const deniedSignals = await getAuthorizationDeniedSignals({
      organizationId: orgB.id,
      start,
      end,
      threshold: 2,
    });

    assert.ok(
      deniedSignals.some(
        (signal) => signal.scope === `${orgB.id}:${facilitator.id}` && signal.count >= 2,
      ),
    );
  } finally {
    await cleanupAuditFixtures({
      organizationIds: [orgA.id, orgB.id],
      userIds: [ngoAdmin.id, facilitator.id],
    });
  }
});

test("audit API routes expose read-only handlers for append-only integrity", () => {
  const eventsRoute = auditEventsRoute as Record<string, unknown>;
  const triageRoute = auditTriageRoute as Record<string, unknown>;

  assert.equal(typeof eventsRoute.GET, "function");
  assert.equal(typeof triageRoute.GET, "function");

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(eventsRoute[method], undefined);
    assert.equal(triageRoute[method], undefined);
  }
});

test("audit event rows are immutable at the database layer", async () => {
  const id = suffix();
  const organization = await prisma.organization.create({
    data: { id: `org-audit-immutable-${id}`, name: `Audit Immutable Org ${id}` },
  });
  const actor = await prisma.user.create({
    data: {
      email: `audit-immutable-${id}@example.org`,
      name: "Audit Immutable Actor",
      role: ROLES.FACILITATOR,
      organizationId: null,
    },
  });

  try {
    const event = await writeAuditEvent({
      eventKey: "phase.review.requested",
      eventType: "mutation",
      actorId: actor.id,
      actorRole: actor.role as Role,
      organizationId: organization.id,
      targetEntityType: "phase",
      targetEntityId: "3",
      metadata: { source: "immutability-test" },
    });

    await assert.rejects(
      () =>
        prisma.auditEvent.update({
          where: { id: event.id },
          data: { eventKey: "tampered.event" },
        }),
      (error) => {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error);
        return message.includes("immutable") || message.includes("constraint violated");
      },
    );

    await assert.rejects(
      () =>
        prisma.auditEvent.delete({
          where: { id: event.id },
        }),
      (error) => {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error);
        return message.includes("immutable") || message.includes("constraint violated");
      },
    );
  } finally {
    await cleanupAuditFixtures({
      organizationIds: [organization.id],
      userIds: [actor.id],
    });
  }
});
