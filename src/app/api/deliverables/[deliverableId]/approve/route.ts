import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { approveDeliverableVersion } from "@/lib/deliverables";
import { getSession } from "@/lib/session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  try {
    const { deliverableId } = await params;
    const session = await getSession();
    if (!hasPermission(session.role, "canApprovePhases")) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_approve_forbidden",
      });
      return NextResponse.json({ error: "Only facilitators can approve deliverables." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = typeof body?.organizationId === "string" ? body.organizationId : null;
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required for approval." }, { status: 400 });
    }

    const deliverable = await approveDeliverableVersion({
      organizationId,
      deliverableId,
      reviewerId: session.id,
    });
    await writeAuditEvent({
      eventKey: "deliverable.approved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverable.id,
    });
    return NextResponse.json({ deliverable, reviewerId: session.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve deliverable." },
      { status: 500 },
    );
  }
}
