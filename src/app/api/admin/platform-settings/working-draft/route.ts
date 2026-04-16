import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import { ROLES } from "@/lib/auth";
import {
  getWorkingDraftVisibility,
  setWorkingDraftVisibility,
} from "@/lib/platform-settings-service";
import { getSession } from "@/lib/session";

type UpdateWorkingDraftPayload = {
  isVisible?: boolean;
};

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (session.role !== ROLES.FACILITATOR) {
      throw new AuthorizationError(
        "Only facilitators can read platform settings.",
        "ROLE_FORBIDDEN",
        403,
      );
    }

    const workingDraftVisible = await getWorkingDraftVisibility();
    return NextResponse.json({ workingDraftVisible });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load working draft visibility.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as UpdateWorkingDraftPayload;

    if (typeof body.isVisible !== "boolean") {
      return NextResponse.json({ error: "isVisible boolean is required." }, { status: 400 });
    }

    const workingDraftVisible = await setWorkingDraftVisibility({
      session,
      isVisible: body.isVisible,
    });

    return NextResponse.json({ workingDraftVisible });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update working draft visibility.",
      },
      { status: 500 },
    );
  }
}
