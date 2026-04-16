import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import {
  getOrganizationGuidance,
  upsertOrganizationGuidance,
} from "@/lib/facilitator-guidance-service";
import { getSession } from "@/lib/session";

type UpsertGuidancePayload = {
  facilitatorName?: string;
  message?: string;
  currentTasksRaw?: string;
  pendingTasksRaw?: string;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const session = await getSession();
    const { organizationId } = await context.params;

    if (!organizationId || organizationId.trim().length === 0) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    const guidance = await getOrganizationGuidance({
      session,
      organizationId,
    });

    return NextResponse.json({
      guidance: {
        facilitatorName: guidance.facilitatorName,
        message: guidance.message,
        currentTasks: guidance.currentTasks,
        pendingTasks: guidance.pendingTasks,
        updatedAt: guidance.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load guidance." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const session = await getSession();
    const { organizationId } = await context.params;
    const body = (await request.json()) as UpsertGuidancePayload;

    if (!organizationId || organizationId.trim().length === 0) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    await upsertOrganizationGuidance({
      session,
      organizationId,
      facilitatorName: body.facilitatorName ?? "",
      message: body.message ?? "",
      currentTasksRaw: body.currentTasksRaw ?? "",
      pendingTasksRaw: body.pendingTasksRaw ?? "",
    });

    const guidance = await getOrganizationGuidance({
      session,
      organizationId,
    });

    return NextResponse.json({
      guidance: {
        facilitatorName: guidance.facilitatorName,
        message: guidance.message,
        currentTasks: guidance.currentTasks,
        pendingTasks: guidance.pendingTasks,
        updatedAt: guidance.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update guidance." },
      { status: 500 },
    );
  }
}
