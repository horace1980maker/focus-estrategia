import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { publishDeliverableVersion } from "@/lib/deliverables";
import { getSession } from "@/lib/session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  try {
    const { deliverableId } = await params;
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_publish_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_publish_forbidden",
      });
      return NextResponse.json({ error: "Only NGO admins can publish deliverables." }, { status: 403 });
    }

    const deliverable = await publishDeliverableVersion({
      organizationId: session.organizationId,
      deliverableId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.published",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverable.id,
    });
    return NextResponse.json({ deliverable });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish deliverable." },
      { status: 500 },
    );
  }
}
