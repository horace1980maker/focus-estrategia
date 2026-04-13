import { NextRequest, NextResponse } from "next/server";
import { AuthServiceError, switchSessionOrganizationContext } from "@/lib/auth-service";
import { getSession } from "@/lib/session";

type ContextPayload = {
  organizationId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const payload = (await request.json()) as ContextPayload;
    const organizationId = payload.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 },
      );
    }

    const updatedOrganizationId = await switchSessionOrganizationContext({
      session,
      organizationId,
    });

    return NextResponse.json({
      organizationId: updatedOrganizationId,
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update context." },
      { status: 500 },
    );
  }
}
