import { NextRequest, NextResponse } from "next/server";
import { ROLES } from "@/lib/auth";
import { getAuthorizationDeniedSignals } from "@/lib/audit";
import { getSession } from "@/lib/session";

function parseDays(raw: string | null): number {
  const parsed = Number(raw ?? "7");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 7;
  }
  return Math.min(30, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (session.role !== ROLES.FACILITATOR && session.role !== ROLES.FOCUS_COORDINATOR) {
      return NextResponse.json(
        { error: "Only facilitator and focus_coordinator can access triage signals." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const days = parseDays(url.searchParams.get("days"));
    const threshold = Math.max(1, Number(url.searchParams.get("threshold") ?? "5"));
    const organizationId = url.searchParams.get("organizationId") ?? undefined;

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);

    const deniedSignals = await getAuthorizationDeniedSignals({
      organizationId,
      start,
      end,
      threshold,
    });

    return NextResponse.json({
      start,
      end,
      threshold,
      deniedSignals,
      guidance:
        deniedSignals.length > 0
          ? [
              "Validate actor role assignments and organization context.",
              "Review recent denied requests for repeated endpoint patterns.",
              "Escalate if the same actor/scope appears repeatedly across 24h.",
            ]
          : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate triage signals." },
      { status: 500 },
    );
  }
}
