import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import {
  createOrRegenerateDeliverableVersion,
  listDeliverableVersions,
} from "@/lib/deliverables";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverables_list_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }

    const versions = await listDeliverableVersions(session.organizationId);
    return NextResponse.json({ versions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load deliverables." },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverables_generate_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        reason: "deliverables_generate_forbidden",
      });
      return NextResponse.json({ error: "Only NGO admins can generate deliverables." }, { status: 403 });
    }

    const result = await createOrRegenerateDeliverableVersion({
      organizationId: session.organizationId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.regenerated",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: result.deliverable.id,
      metadata: {
        versionNumber: result.deliverable.versionNumber,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate deliverable." },
      { status: 500 },
    );
  }
}
