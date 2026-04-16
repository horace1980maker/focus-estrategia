import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import { getOnboardingWorkspace, saveOnboardingWorkspace } from "@/lib/onboarding-service";
import { getSession } from "@/lib/session";

type UpdateOnboardingConfigPayload = {
  mouDocumentUrl?: string;
  documentsFolderUrl?: string;
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

    const onboarding = await getOnboardingWorkspace({
      session,
      organizationId,
    });

    return NextResponse.json({
      onboardingConfig: {
        mouDocumentUrl: onboarding.workspace.mouDocumentUrl ?? "",
        documentsFolderUrl: onboarding.workspace.documentsFolderUrl ?? "",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load onboarding configuration." },
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
    const body = (await request.json()) as UpdateOnboardingConfigPayload;

    if (!organizationId || organizationId.trim().length === 0) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    await saveOnboardingWorkspace({
      session,
      organizationId,
      mouDocumentUrl: body.mouDocumentUrl ?? "",
      documentsFolderUrl: body.documentsFolderUrl ?? "",
    });

    const onboarding = await getOnboardingWorkspace({
      session,
      organizationId,
    });

    return NextResponse.json({
      onboardingConfig: {
        mouDocumentUrl: onboarding.workspace.mouDocumentUrl ?? "",
        documentsFolderUrl: onboarding.workspace.documentsFolderUrl ?? "",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update onboarding configuration." },
      { status: 500 },
    );
  }
}
