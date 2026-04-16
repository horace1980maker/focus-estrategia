import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireOrganizationScope } from "@/lib/access-guards";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function buildDownloadHeaders(input: {
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number;
}) {
  const encodedFileName = encodeURIComponent(input.fileName);
  return {
    "Content-Type": input.mimeType || "application/octet-stream",
    "Content-Length": String(input.fileSizeBytes),
    "Content-Disposition": `attachment; filename*=UTF-8''${encodedFileName}`,
    "Cache-Control": "private, no-store",
  } as const;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    const { id } = await context.params;

    if (!id || id.trim().length === 0) {
      return NextResponse.json({ error: "evidence id is required." }, { status: 400 });
    }

    const evidence = await prisma.onboardingEvidence.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        fileBytes: true,
      },
    });

    if (!evidence) {
      return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
    }

    await requireOrganizationScope({
      session,
      organizationId: evidence.organizationId,
      action: "read",
      context: {
        reason: "onboarding_evidence_read_forbidden",
        targetEntityType: "onboarding_evidence",
        targetEntityId: evidence.id,
      },
    });

    return new NextResponse(new Uint8Array(evidence.fileBytes), {
      status: 200,
      headers: buildDownloadHeaders({
        fileName: evidence.fileName,
        mimeType: evidence.mimeType,
        fileSizeBytes: evidence.fileSizeBytes,
      }),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download evidence." },
      { status: 500 },
    );
  }
}
