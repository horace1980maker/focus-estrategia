import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { queryAuditEvents, type AuditEventType } from "@/lib/audit";

function parseDate(raw: string | null): Date | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const url = new URL(request.url);

    const events = await queryAuditEvents({
      session,
      filters: {
        organizationId: url.searchParams.get("organizationId") ?? undefined,
        actorId: url.searchParams.get("actorId") ?? undefined,
        eventKey: url.searchParams.get("eventKey") ?? undefined,
        eventType: (url.searchParams.get("eventType") as AuditEventType | null) ?? undefined,
        start: parseDate(url.searchParams.get("start")),
        end: parseDate(url.searchParams.get("end")),
        limit: Number(url.searchParams.get("limit") ?? "100"),
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit events." },
      { status: 500 },
    );
  }
}
