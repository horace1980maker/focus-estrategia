import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireOrganizationScope } from "@/lib/access-guards";
import { getSession } from "@/lib/session";
import { getScopedRoiSetting, updateRoiSetting } from "@/lib/analytics";

type UpdatePayload = {
  organizationId?: string | null;
  hourlyRateUsd?: number;
  baselineManualHoursPerTask?: number;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    await requireOrganizationScope({
      session,
      organizationId: organizationId ?? session.organizationId,
      action: "read",
      allowGlobalScope: true,
      context: {
        reason: "roi_setting_read_forbidden",
        targetEntityType: "roi_setting",
      },
    });
    const setting = await getScopedRoiSetting({
      session,
      organizationId,
    });

    return NextResponse.json(setting);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load ROI settings.";
    const status = message.includes("Not authorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as UpdatePayload;

    const hourlyRateUsd = Number(body.hourlyRateUsd);
    const baselineManualHoursPerTask = Number(body.baselineManualHoursPerTask);

    if (!Number.isFinite(hourlyRateUsd) || hourlyRateUsd < 0) {
      return NextResponse.json(
        { error: "hourlyRateUsd must be a non-negative number." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(baselineManualHoursPerTask) || baselineManualHoursPerTask < 0) {
      return NextResponse.json(
        { error: "baselineManualHoursPerTask must be a non-negative number." },
        { status: 400 },
      );
    }

    await requireOrganizationScope({
      session,
      organizationId: body.organizationId ?? session.organizationId,
      action: "write",
      allowGlobalScope: true,
      allowFacilitatorWrite: true,
      context: {
        reason: "roi_setting_update_forbidden",
        targetEntityType: "roi_setting",
      },
    });

    const updated = await updateRoiSetting({
      session,
      organizationId: body.organizationId ?? null,
      hourlyRateUsd,
      baselineManualHoursPerTask,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update ROI settings.";
    const status = message.includes("Not authorized") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
