import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import {
  getActiveDiagnosisSurveyDefinition,
  submitDiagnosisSurveyResponse,
} from "@/lib/diagnosis-survey";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_definition_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }

    const definition = await getActiveDiagnosisSurveyDefinition();
    return NextResponse.json({
      id: definition.id,
      version: definition.version,
      name: definition.name,
      sections: definition.sections,
      questions: definition.questions,
      interpretationGuideJson: definition.interpretationGuideJson,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load survey definition." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_submit_missing_org_context",
      });
      return NextResponse.json({ error: "No organization context found." }, { status: 403 });
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "diagnosis_survey",
        reason: "diagnosis_submit_forbidden",
      });
      return NextResponse.json({ error: "Not authorized to submit diagnosis responses." }, { status: 403 });
    }

    const body = await request.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Payload must include answers object." }, { status: 400 });
    }

    const result = await submitDiagnosisSurveyResponse({
      organizationId: session.organizationId,
      submittedById: session.id,
      answers,
    });
    await writeAuditEvent({
      eventKey: "diagnosis.survey.submitted",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "diagnosis_survey_response",
      targetEntityId: String(result.responseId),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit diagnosis survey." },
      { status: 500 },
    );
  }
}
