import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import {
  OrganizationAdminServiceError,
  removeOrganizationAsFacilitator,
} from "@/lib/organization-admin-service";
import { getSession } from "@/lib/session";

type RemoveOrganizationPayload = {
  confirmationText?: string;
};

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const session = await getSession();
    const { organizationId } = await context.params;
    const body = (await request.json()) as RemoveOrganizationPayload;
    const confirmationText = body.confirmationText ?? "";

    const removed = await removeOrganizationAsFacilitator({
      actor: session,
      organizationId,
      confirmationText,
    });

    return NextResponse.json({
      organizationId: removed.organizationId,
      removedAt: removed.removedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof OrganizationAdminServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove organization." },
      { status: 500 },
    );
  }
}
