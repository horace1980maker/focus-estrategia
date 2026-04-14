import { NextRequest, NextResponse } from "next/server";
import { finalizeActivitySessionById, finalizeLatestSessionForSection } from "@/lib/analytics";
import { getSessionOrNull } from "@/lib/session";

type EndPayload = {
  sessionId?: string;
  sectionKey?: string;
  closedByTimeout?: boolean;
};

async function parsePayload(request: NextRequest): Promise<EndPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as EndPayload;
  }

  const text = await request.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as EndPayload;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionOrNull();
  if (!session) {
    return NextResponse.json({
      sessionId: null,
      endedAt: null,
      durationMinutes: 0,
    });
  }

  try {
    const body = await parsePayload(request);

    if (body.sessionId) {
      const closed = await finalizeActivitySessionById({
        session,
        sessionId: body.sessionId,
        closedByTimeout: body.closedByTimeout,
      });
      return NextResponse.json({
        sessionId: closed?.id ?? null,
        endedAt: closed?.endedAt ?? null,
        durationMinutes: closed?.durationMinutes ?? 0,
      });
    }

    if (body.sectionKey) {
      const closed = await finalizeLatestSessionForSection({
        session,
        sectionKey: body.sectionKey,
        closedByTimeout: body.closedByTimeout,
      });
      return NextResponse.json({
        sessionId: closed?.id ?? null,
        endedAt: closed?.endedAt ?? null,
        durationMinutes: closed?.durationMinutes ?? 0,
      });
    }

    return NextResponse.json(
      { error: "sessionId or sectionKey is required." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to end session." },
      { status: 500 },
    );
  }
}
