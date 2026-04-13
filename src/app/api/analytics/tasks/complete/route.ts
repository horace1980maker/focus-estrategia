import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { recordTaskCompletion } from "@/lib/analytics";

type TaskCompletePayload = {
  sectionKey?: string;
  phaseNumber?: number;
  count?: number;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as TaskCompletePayload;

    if (!session.organizationId) {
      return NextResponse.json(
        { error: "Current user has no organization context." },
        { status: 400 },
      );
    }

    if (!body.sectionKey || body.sectionKey.trim().length === 0) {
      return NextResponse.json(
        { error: "sectionKey is required." },
        { status: 400 },
      );
    }

    await recordTaskCompletion({
      organizationId: session.organizationId,
      sectionKey: body.sectionKey.trim(),
      phaseNumber: body.phaseNumber,
      count: body.count,
      completedAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record task completion." },
      { status: 500 },
    );
  }
}
