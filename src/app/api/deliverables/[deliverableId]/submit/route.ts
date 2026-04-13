import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { submitDeliverableForReview } from "@/lib/deliverables";
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
        reason: "deliverable_submit_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_submit_forbidden",
      });
      return NextResponse.json({ error: "Only NGO admins can submit deliverables for review." }, { status: 403 });
    }

    const deliverable = await submitDeliverableForReview({
      organizationId: session.organizationId,
      deliverableId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.submitted_for_review",
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
      { error: error instanceof Error ? error.message : "Failed to submit deliverable for review." },
      { status: 500 },
    );
  }
}
