import { NextRequest, NextResponse } from "next/server";
import { ROLES } from "@/lib/auth";
import { reconcileAnalyticsProjection } from "@/lib/analytics";
import { writeDeniedAccessEvent } from "@/lib/audit";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (session.role !== ROLES.FACILITATOR) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "analytics_projection",
        reason: "analytics_reconcile_forbidden",
      });
      return NextResponse.json(
        { error: "Only facilitator can run reconciliation." },
        { status: 403 },
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      organizationId?: string;
    };
    const report = await reconcileAnalyticsProjection({
      organizationId: payload.organizationId,
    });

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reconcile analytics projection.",
      },
      { status: 500 },
    );
  }
}
