import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import { ROLES } from "@/lib/auth";
import {
  getExampleLibraryVisibility,
  setExampleLibraryVisibility,
} from "@/lib/platform-settings-service";
import { getSession } from "@/lib/session";

type UpdateExampleLibraryPayload = {
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

    const exampleLibraryVisible = await getExampleLibraryVisibility();
    return NextResponse.json({ exampleLibraryVisible });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load example library visibility.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as UpdateExampleLibraryPayload;

    if (typeof body.isVisible !== "boolean") {
      return NextResponse.json({ error: "isVisible boolean is required." }, { status: 400 });
    }

    const exampleLibraryVisible = await setExampleLibraryVisibility({
      session,
      isVisible: body.isVisible,
    });

    return NextResponse.json({ exampleLibraryVisible });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update example library visibility.",
      },
      { status: 500 },
    );
  }
}
