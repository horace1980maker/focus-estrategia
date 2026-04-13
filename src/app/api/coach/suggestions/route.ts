import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildCoachSuggestion, getCoachPromptStarters } from "@/lib/phase-coach";

type CoachPayload = {
  lang?: "es" | "en";
  phaseNumber?: number;
  prompt?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CoachPayload;
    const lang = body.lang === "en" ? "en" : "es";
    const phaseNumber = Number(body.phaseNumber ?? 0);
    if (!Number.isFinite(phaseNumber) || phaseNumber < 1 || phaseNumber > 6) {
      return NextResponse.json(
        { error: "phaseNumber must be between 1 and 6." },
        { status: 400 },
      );
    }

    const session = await getSession();
    const starters = getCoachPromptStarters({
      lang,
      phaseNumber,
      role: session.role,
    });
    const suggestion = buildCoachSuggestion({
      lang,
      phaseNumber,
      role: session.role,
      prompt: body.prompt ?? "",
    });

    return NextResponse.json({
      starters,
      suggestion,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Coach suggestion generation failed.",
      },
      { status: 500 },
    );
  }
}
