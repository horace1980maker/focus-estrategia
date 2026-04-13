import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import {
  OrganizationAdminServiceError,
  resetOrganizationContentAsFacilitator,
} from "@/lib/organization-admin-service";
import { getSession } from "@/lib/session";

type ResetOrganizationPayload = {
  confirmationText?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const session = await getSession();
    const { organizationId } = await context.params;
    const body = (await request.json()) as ResetOrganizationPayload;

    if (!organizationId || organizationId.trim().length === 0) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    const reset = await resetOrganizationContentAsFacilitator({
      actor: session,
      organizationId,
      confirmationText: body.confirmationText ?? "",
    });

    return NextResponse.json({
      organizationId: reset.organizationId,
      resetAt: reset.resetAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof OrganizationAdminServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset organization content." },
      { status: 500 },
    );
  }
}
