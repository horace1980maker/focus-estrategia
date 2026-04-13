import { NextRequest, NextResponse } from "next/server";
import { getSession, isAuthenticationRequiredError } from "@/lib/session";
import { touchActivitySession } from "@/lib/analytics";

type TouchPayload = {
  sessionId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as TouchPayload;

    if (!body.sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 },
      );
    }

    const updated = await touchActivitySession({
      session,
      sessionId: body.sessionId,
    });

    return NextResponse.json({
      sessionId: updated.id,
      lastActivityAt: updated.lastActivityAt,
      endedAt: updated.endedAt,
    });
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to touch session." },
      { status: 500 },
    );
  }
}
