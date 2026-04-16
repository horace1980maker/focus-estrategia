import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import { uploadOnboardingEvidence } from "@/lib/onboarding-service";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const formData = await request.formData();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const file = formData.get("evidenceFile");

    if (organizationId.length === 0) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Evidence file is required." }, { status: 400 });
    }

    const evidence = await uploadOnboardingEvidence({
      session,
      organizationId,
      file,
    });

    return NextResponse.json({
      evidence: {
        id: evidence.id,
        fileName: evidence.fileName,
        fileSizeBytes: evidence.fileSizeBytes,
        createdAt: evidence.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload evidence." },
      { status: 500 },
    );
  }
}
