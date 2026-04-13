import { prisma } from "./prisma";
import { getPhaseOutputSummary } from "./phase-outputs";

export type DeliverableLifecycleStatus = "draft" | "in_review" | "approved" | "published";
export type DeliverableReadinessStatus = "not_ready" | "ready_for_review";

export class DeliverableError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type SourcePhaseRef = {
  phaseNumber: number;
  phaseKey: string;
  status: string;
  requiredOutputCount: number;
  completedOutputCount: number;
};

async function evaluateReadiness(
  organizationId: string,
): Promise<{
  readinessStatus: DeliverableReadinessStatus;
  missingOutputs: Array<{ outputKey: string; outputLabel: string; phaseNumber: number }>;
  sourcePhaseRefs: SourcePhaseRef[];
}> {
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: {
      phases: { orderBy: { phaseNumber: "asc" } },
    },
  });

  if (!tracker) {
    throw new DeliverableError("Organization has no phase tracker.", "NO_PHASE_TRACKER");
  }

  const sourcePhaseRefs: SourcePhaseRef[] = [];
  const missingOutputs: Array<{ outputKey: string; outputLabel: string; phaseNumber: number }> =
    [];

  for (const phase of tracker.phases.filter((item) => item.phaseNumber < 6)) {
    const summary = await getPhaseOutputSummary(phase.id, phase.phaseNumber);
    sourcePhaseRefs.push({
      phaseNumber: phase.phaseNumber,
      phaseKey: phase.phaseKey,
      status: phase.status,
      requiredOutputCount: summary.requiredCount,
      completedOutputCount: summary.completedCount,
    });

    for (const missing of summary.missingOutputs) {
      missingOutputs.push({
        phaseNumber: phase.phaseNumber,
        outputKey: missing.outputKey,
        outputLabel: missing.outputLabel,
      });
    }
  }

  const validationPhase = tracker.phases.find((phase) => phase.phaseNumber === 5);
  const validationApproved = validationPhase?.status === "approved";
  const readinessStatus: DeliverableReadinessStatus =
    validationApproved && missingOutputs.length === 0 ? "ready_for_review" : "not_ready";

  return { readinessStatus, missingOutputs, sourcePhaseRefs };
}

export async function listDeliverableVersions(organizationId: string) {
  return prisma.deliverable.findMany({
    where: { organizationId },
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
  });
}

export async function createOrRegenerateDeliverableVersion(input: {
  organizationId: string;
  title?: string;
}) {
  const { readinessStatus, sourcePhaseRefs } = await evaluateReadiness(input.organizationId);
  const latest = await prisma.deliverable.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { versionNumber: "desc" },
  });

  const nextVersion = (latest?.versionNumber ?? 0) + 1;
  const deliverable = await prisma.deliverable.create({
    data: {
      organizationId: input.organizationId,
      phaseNumber: 6,
      phaseKey: "deliverables",
      title:
        input.title ??
        `Deliverables Package v${nextVersion.toString().padStart(2, "0")}`,
      status: "draft",
      readinessStatus,
      versionNumber: nextVersion,
      sourcePhaseRefsJson: JSON.stringify(sourcePhaseRefs),
      generatedAt: new Date(),
    },
  });

  return { deliverable, readinessStatus };
}

export async function refreshDeliverableReadiness(organizationId: string) {
  const { readinessStatus, missingOutputs, sourcePhaseRefs } =
    await evaluateReadiness(organizationId);

  await prisma.deliverable.updateMany({
    where: { organizationId, status: { in: ["draft", "in_review"] } },
    data: {
      readinessStatus,
      sourcePhaseRefsJson: JSON.stringify(sourcePhaseRefs),
    },
  });

  return {
    readinessStatus,
    missingOutputs,
  };
}

export async function submitDeliverableForReview(input: {
  organizationId: string;
  deliverableId: string;
}) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: input.deliverableId, organizationId: input.organizationId },
  });
  if (!deliverable) {
    throw new DeliverableError("Deliverable not found.", "NOT_FOUND");
  }

  const readiness = await refreshDeliverableReadiness(input.organizationId);
  if (readiness.readinessStatus !== "ready_for_review") {
    throw new DeliverableError(
      "Deliverable is not ready for review.",
      "NOT_READY_FOR_REVIEW",
      { missingOutputs: readiness.missingOutputs },
    );
  }
  if (deliverable.status !== "draft") {
    throw new DeliverableError(
      `Only draft deliverables can be submitted (current: ${deliverable.status}).`,
      "INVALID_LIFECYCLE_STATE",
    );
  }

  return prisma.deliverable.update({
    where: { id: deliverable.id },
    data: {
      status: "in_review",
      readinessStatus: "ready_for_review",
    },
  });
}

export async function approveDeliverableVersion(input: {
  organizationId: string;
  deliverableId: string;
  reviewerId: string;
}) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: input.deliverableId, organizationId: input.organizationId },
  });
  if (!deliverable) {
    throw new DeliverableError("Deliverable not found.", "NOT_FOUND");
  }
  if (deliverable.status !== "in_review") {
    throw new DeliverableError(
      `Only in_review deliverables can be approved (current: ${deliverable.status}).`,
      "INVALID_LIFECYCLE_STATE",
    );
  }

  return prisma.deliverable.update({
    where: { id: deliverable.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: input.reviewerId,
    },
  });
}

export async function publishDeliverableVersion(input: {
  organizationId: string;
  deliverableId: string;
}) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: input.deliverableId, organizationId: input.organizationId },
  });
  if (!deliverable) {
    throw new DeliverableError("Deliverable not found.", "NOT_FOUND");
  }
  if (deliverable.status !== "approved") {
    throw new DeliverableError(
      `Only approved deliverables can be published (current: ${deliverable.status}).`,
      "INVALID_LIFECYCLE_STATE",
    );
  }

  return prisma.deliverable.update({
    where: { id: deliverable.id },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });
}

type ExportArtifact = {
  format: string;
  url: string;
  generatedAt: string;
  versionNumber: number;
};

type ExportMetadata = {
  artifacts: ExportArtifact[];
};

export async function requestDeliverableExport(input: {
  organizationId: string;
  deliverableId: string;
  format: "pdf" | "docx";
}) {
  const deliverable = await prisma.deliverable.findFirst({
    where: { id: input.deliverableId, organizationId: input.organizationId },
  });
  if (!deliverable) {
    throw new DeliverableError("Deliverable not found.", "NOT_FOUND");
  }
  if (!["approved", "published"].includes(deliverable.status)) {
    throw new DeliverableError(
      `Deliverable must be approved or published before export (current: ${deliverable.status}).`,
      "EXPORT_NOT_ALLOWED",
    );
  }

  const exportMetadata = parseJson<ExportMetadata>(deliverable.exportMetadataJson, {
    artifacts: [],
  });

  const existingArtifact = exportMetadata.artifacts.find(
    (artifact) =>
      artifact.format === input.format &&
      artifact.versionNumber === deliverable.versionNumber,
  );

  if (existingArtifact) {
    return {
      deliverable,
      export: existingArtifact,
      reused: true,
    };
  }

  const artifact: ExportArtifact = {
    format: input.format,
    versionNumber: deliverable.versionNumber,
    generatedAt: new Date().toISOString(),
    url: `/api/deliverables/${deliverable.id}/exports/${input.format}?version=${deliverable.versionNumber}`,
  };

  const nextMetadata: ExportMetadata = {
    artifacts: [...exportMetadata.artifacts, artifact],
  };

  const updated = await prisma.deliverable.update({
    where: { id: deliverable.id },
    data: {
      exportMetadataJson: JSON.stringify(nextMetadata),
    },
  });

  return {
    deliverable: updated,
    export: artifact,
    reused: false,
  };
}
