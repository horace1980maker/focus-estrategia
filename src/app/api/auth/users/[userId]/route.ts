import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import {
  OrganizationAdminServiceError,
  removeUserAsFacilitator,
} from "@/lib/organization-admin-service";
import { getSession } from "@/lib/session";

type RemoveUserPayload = {
  confirmationText?: string;
};

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
} as const;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await getSession();
    const { userId } = await context.params;
    const body = (await request.json()) as RemoveUserPayload;
    const confirmationText = body.confirmationText ?? "";

    const removed = await removeUserAsFacilitator({
      actor: session,
      userId,
      confirmationText,
    });

    return NextResponse.json(
      {
        userId: removed.userId,
        removedAt: removed.removedAt.toISOString(),
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof OrganizationAdminServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove user." },
      { status: 500 },
    );
  }
}
