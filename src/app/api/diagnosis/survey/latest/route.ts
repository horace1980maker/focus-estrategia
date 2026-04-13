import { NextResponse } from "next/server";
import { writeDeniedAccessEvent } from "@/lib/audit";
import { getLatestDiagnosisSummary } from "@/lib/diagnosis-survey";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_latest_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }

    const summary = await getLatestDiagnosisSummary(session.organizationId);
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load latest diagnosis summary." },
      { status: 500 },
    );
  }
}
