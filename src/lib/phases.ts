// Phase Gating — Server-side logic enforcing sequential phase progression
import { prisma } from "./prisma";
import {
  TOTAL_PHASES,
  normalizePhaseNumber,
  phaseNumberToKey,
} from "./phase-model";
import {
  PHASE_STATUS,
  canApprove,
  canReject,
  canRequestReview,
  getNextPhaseNumber,
  isTerminalPhase,
} from "./phase-state-machine";
import {
  getPhaseOutputSummary,
  setPhaseOutputCompletion,
} from "./phase-outputs";

interface PhaseRecord {
  id: string;
  phaseNumber: number;
  phaseKey: string;
  status: string;
}

type MissingOutput = {
  outputKey: string;
  outputLabel: string;
};

export class PhaseGateError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/**
 * Ensures an organization has a phase tracker.
 * In local/dev scenarios, this self-heals missing tracker rows by
 * initializing the default 6-phase structure once the organization exists.
 */
async function ensurePhaseTracker(organizationId: string) {
  const ensurePhaseRows = async (phaseTrackerId: string) => {
    const phaseCount = await prisma.phase.count({
      where: { phaseTrackerId },
    });
    if (phaseCount >= TOTAL_PHASES) {
      return;
    }

    const now = new Date();
    for (let phaseNumber = 1; phaseNumber <= TOTAL_PHASES; phaseNumber += 1) {
      const phaseKey = phaseNumberToKey(phaseNumber) ?? "onboarding";
      await prisma.phase.upsert({
        where: {
          phaseTrackerId_phaseNumber: {
            phaseTrackerId,
            phaseNumber,
          },
        },
        create: {
          phaseTrackerId,
          phaseNumber,
          phaseKey,
          status: phaseNumber === 1 ? PHASE_STATUS.IN_PROGRESS : PHASE_STATUS.LOCKED,
          startedAt: phaseNumber === 1 ? now : null,
        },
        update: {
          phaseKey,
        },
      });
    }
  };

  const existing = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true, currentPhase: true },
  });
  if (existing) {
    await ensurePhaseRows(existing.id);
    return existing;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    return null;
  }

  try {
    await initializePhases(organizationId);
  } catch {
    // Concurrent initialization requests can race; refetch below.
  }

  const created = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    select: { id: true, currentPhase: true },
  });
  if (created) {
    await ensurePhaseRows(created.id);
  }
  return created;
}

async function assertRequiredOutputsComplete(phase: PhaseRecord) {
  const summary = await getPhaseOutputSummary(phase.id, phase.phaseNumber);
  if (summary.missingOutputs.length > 0) {
    throw new PhaseGateError(
      `Phase ${phase.phaseNumber} is missing required outputs.`,
      "MISSING_REQUIRED_OUTPUTS",
      {
        phaseNumber: phase.phaseNumber,
        phaseKey: phase.phaseKey,
        missingOutputs: summary.missingOutputs,
        requiredCount: summary.requiredCount,
        completedCount: summary.completedCount,
      },
    );
  }
}

/**
 * Initialize phase tracker and all 6 phases for a new organization.
 * Phase 1 starts as "in_progress", all others as "locked".
 */
export async function initializePhases(organizationId: string) {
  const tracker = await prisma.phaseTracker.create({
    data: {
      organizationId,
      currentPhase: 1,
      phases: {
        create: Array.from({ length: TOTAL_PHASES }, (_, i) => ({
          phaseNumber: i + 1,
          phaseKey: phaseNumberToKey(i + 1) ?? "onboarding",
          status: i === 0 ? "in_progress" : "locked",
          startedAt: i === 0 ? new Date() : null,
        })),
      },
    },
    include: { phases: true },
  });
  return tracker;
}

/**
 * Get the current phase status for an organization.
 */
export async function getPhaseStatus(organizationId: string) {
  const ensured = await ensurePhaseTracker(organizationId);
  if (!ensured) {
    return null;
  }

  return prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: {
      phases: {
        orderBy: { phaseNumber: "asc" },
        include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
}

/**
 * Request review for a phase — Only ngo_admin can trigger this.
 * Phase must be "in_progress" to request review.
 */
export async function requestPhaseReview(organizationId: string, phaseNumber: number) {
  const targetPhaseNumber = normalizePhaseNumber(phaseNumber);
  const ensured = await ensurePhaseTracker(organizationId);
  if (!ensured) throw new Error("Organization has no phase tracker");
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: true },
  });

  if (!tracker) throw new Error("Organization has no phase tracker");

  const phase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === targetPhaseNumber);
  if (!phase) throw new Error(`Phase ${targetPhaseNumber} not found`);
  if (!canRequestReview(phase.status)) {
    throw new Error(`Phase ${targetPhaseNumber} is not in progress (status: ${phase.status})`);
  }
  await assertRequiredOutputsComplete(phase);

  return prisma.phase.update({
    where: { id: phase.id },
    data: { status: PHASE_STATUS.REVIEW_REQUESTED },
  });
}

/**
 * Approve a phase — Only facilitators can trigger this.
 * Unlocks Phase N+1 if it exists.
 */
export async function approvePhase(
  organizationId: string,
  phaseNumber: number,
  reviewerId: string,
  feedback?: string
) {
  const targetPhaseNumber = normalizePhaseNumber(phaseNumber);
  const ensured = await ensurePhaseTracker(organizationId);
  if (!ensured) throw new Error("Organization has no phase tracker");
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: { orderBy: { phaseNumber: "asc" } } },
  });

  if (!tracker) throw new Error("Organization has no phase tracker");

  const phase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === targetPhaseNumber);
  if (!phase) throw new Error(`Phase ${targetPhaseNumber} not found`);
  if (!canApprove(phase.status)) {
    throw new Error(`Phase ${targetPhaseNumber} has not been submitted for review`);
  }
  await assertRequiredOutputsComplete(phase);

  // Approve current phase
  await prisma.phase.update({
    where: { id: phase.id },
    data: { status: PHASE_STATUS.APPROVED, completedAt: new Date() },
  });

  // Create review record
  await prisma.phaseReview.create({
    data: {
      phaseId: phase.id,
      reviewerId,
      decision: PHASE_STATUS.APPROVED,
      feedback,
    },
  });

  // Unlock next phase if applicable (deliverables is terminal).
  const nextPhaseNumber = getNextPhaseNumber(targetPhaseNumber);
  if (nextPhaseNumber !== null) {
    const nextPhase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === nextPhaseNumber);
    if (nextPhase && nextPhase.status === PHASE_STATUS.LOCKED) {
      await prisma.phase.update({
        where: { id: nextPhase.id },
        data: { status: PHASE_STATUS.IN_PROGRESS, startedAt: new Date() },
      });
    }

    // Advance the tracker's current phase pointer
    await prisma.phaseTracker.update({
      where: { organizationId },
      data: { currentPhase: nextPhaseNumber },
    });
  }

  return {
    approved: targetPhaseNumber,
    unlockedNext: !isTerminalPhase(targetPhaseNumber),
  };
}

/**
 * Reject a phase — sends it back to in_progress with feedback.
 */
export async function rejectPhase(
  organizationId: string,
  phaseNumber: number,
  reviewerId: string,
  feedback: string
) {
  const targetPhaseNumber = normalizePhaseNumber(phaseNumber);
  const ensured = await ensurePhaseTracker(organizationId);
  if (!ensured) throw new Error("Organization has no phase tracker");
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: true },
  });

  if (!tracker) throw new Error("Organization has no phase tracker");

  const phase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === targetPhaseNumber);
  if (!phase) throw new Error(`Phase ${targetPhaseNumber} not found`);

  if (!canReject(phase.status)) {
    throw new Error(`Phase ${targetPhaseNumber} is not pending review (status: ${phase.status})`);
  }

  await prisma.phase.update({
    where: { id: phase.id },
    data: { status: PHASE_STATUS.IN_PROGRESS },
  });

  await prisma.phaseReview.create({
    data: {
      phaseId: phase.id,
      reviewerId,
      decision: "rejected",
      feedback,
    },
  });

  return { rejected: targetPhaseNumber };
}

/**
 * Guard: Can this organization access a given phase?
 * Enforces strict sequential progression — returns false if
 * the target phase is beyond the current unlocked phase.
 */
export async function canAccessPhase(
  organizationId: string,
  targetPhase: number
): Promise<{
  allowed: boolean;
  currentPhase: number;
  reason?: string;
  missingOutputs?: MissingOutput[];
}> {
  const normalizedTarget = normalizePhaseNumber(targetPhase);
  if (targetPhase !== normalizedTarget) {
    return { allowed: false, currentPhase: 0, reason: `Invalid phase number: ${targetPhase}` };
  }

  const tracker = await ensurePhaseTracker(organizationId);

  if (!tracker) {
    return { allowed: false, currentPhase: 0, reason: "Organization has no phase tracker" };
  }

  if (normalizedTarget > tracker.currentPhase) {
    return {
      allowed: false,
      currentPhase: tracker.currentPhase,
      reason: `Phase ${normalizedTarget} is locked. Current phase: ${tracker.currentPhase}`,
    };
  }

  if (normalizedTarget === TOTAL_PHASES) {
    const phases = await prisma.phase.findMany({
      where: { phaseTrackerId: tracker.id },
      orderBy: { phaseNumber: "asc" },
    });

    const validation = phases.find((phase) => phase.phaseNumber === TOTAL_PHASES - 1);
    if (!validation || validation.status !== PHASE_STATUS.APPROVED) {
      return {
        allowed: false,
        currentPhase: tracker.currentPhase,
        reason: "Deliverables phase is locked until validation is approved.",
      };
    }

    const upstreamPhases = phases.filter((phase) => phase.phaseNumber < TOTAL_PHASES);
    const missingOutputs: MissingOutput[] = [];
    for (const phase of upstreamPhases) {
      const summary = await getPhaseOutputSummary(phase.id, phase.phaseNumber);
      missingOutputs.push(...summary.missingOutputs);
    }

    if (missingOutputs.length > 0) {
      return {
        allowed: false,
        currentPhase: tracker.currentPhase,
        reason: "Deliverables phase is locked until all upstream required outputs are complete.",
        missingOutputs,
      };
    }
  }

  return { allowed: true, currentPhase: tracker.currentPhase };
}

export async function getPhaseOutputStatus(organizationId: string, phaseNumber: number) {
  const targetPhaseNumber = normalizePhaseNumber(phaseNumber);
  const ensured = await ensurePhaseTracker(organizationId);
  if (!ensured) {
    throw new Error("Organization has no phase tracker");
  }
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId },
    include: { phases: true },
  });

  if (!tracker) {
    throw new Error("Organization has no phase tracker");
  }

  const phase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === targetPhaseNumber);
  if (!phase) {
    throw new Error(`Phase ${targetPhaseNumber} not found`);
  }

  return getPhaseOutputSummary(phase.id, targetPhaseNumber);
}

export async function updatePhaseOutputStatus(input: {
  organizationId: string;
  phaseNumber: number;
  outputKey: string;
  isCompleted: boolean;
  completedById?: string;
}) {
  const targetPhaseNumber = normalizePhaseNumber(input.phaseNumber);
  const ensured = await ensurePhaseTracker(input.organizationId);
  if (!ensured) {
    throw new Error("Organization has no phase tracker");
  }
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: input.organizationId },
    include: { phases: true },
  });

  if (!tracker) {
    throw new Error("Organization has no phase tracker");
  }

  const phase = tracker.phases.find((p: PhaseRecord) => p.phaseNumber === targetPhaseNumber);
  if (!phase) {
    throw new Error(`Phase ${targetPhaseNumber} not found`);
  }

  return setPhaseOutputCompletion({
    phaseId: phase.id,
    phaseNumber: targetPhaseNumber,
    outputKey: input.outputKey,
    isCompleted: input.isCompleted,
    completedById: input.completedById,
  });
}

/**
 * Get the total number of phases in the system.
 */
export function getTotalPhases(): number {
  return TOTAL_PHASES;
}
