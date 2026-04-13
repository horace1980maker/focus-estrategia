import { NextRequest, NextResponse } from "next/server";
import { getSession, isAuthenticationRequiredError } from "@/lib/session";
import { startOrResumeActivitySession } from "@/lib/analytics";

type StartPayload = {
  sectionKey?: string;
  phaseNumber?: number;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as StartPayload;

    if (!body.sectionKey || body.sectionKey.trim().length === 0) {
      return NextResponse.json(
        { error: "sectionKey is required." },
        { status: 400 },
      );
    }

    if (!session.organizationId) {
      return NextResponse.json(
        { error: "Current user has no organization context." },
        { status: 400 },
      );
    }

    const activitySession = await startOrResumeActivitySession({
      session,
      sectionKey: body.sectionKey.trim(),
      phaseNumber: body.phaseNumber,
    });

    return NextResponse.json({
      sessionId: activitySession.id,
      startedAt: activitySession.startedAt,
      lastActivityAt: activitySession.lastActivityAt,
    });
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start session." },
      { status: 500 },
    );
  }
}
