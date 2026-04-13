import { NextRequest, NextResponse } from "next/server";
import { getRoiBenchmarkHistory } from "@/lib/analytics";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const limit = Number(url.searchParams.get("limit") ?? "100");

    const rows = await getRoiBenchmarkHistory({
      session,
      organizationId,
      limit,
    });

    return NextResponse.json({ history: rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load ROI benchmark history.";
    const status = message.includes("Not authorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
