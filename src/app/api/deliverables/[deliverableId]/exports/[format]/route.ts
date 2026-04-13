import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { requestDeliverableExport } from "@/lib/deliverables";
import { getSession } from "@/lib/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deliverableId: string; format: string }> },
) {
  try {
    const { deliverableId, format } = await params;
    if (format !== "pdf" && format !== "docx") {
      return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
    }

    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_export_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }

    const result = await requestDeliverableExport({
      organizationId: session.organizationId,
      deliverableId,
      format,
    });
    await writeAuditEvent({
      eventKey: "deliverable.export.requested",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverableId,
      metadata: {
        format,
        reused: result.reused,
      },
    });

    return NextResponse.json({
      deliverableId,
      format,
      export: result.export,
      reused: result.reused,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate export." },
      { status: 500 },
    );
  }
}
