"use server";

import { revalidatePath } from "next/cache";
import { ROLES, hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import {
  PhaseGateError,
  approvePhase,
  canAccessPhase,
  getPhaseOutputStatus,
  getPhaseStatus,
  initializePhases,
  rejectPhase,
  requestPhaseReview,
  updatePhaseOutputStatus,
} from "@/lib/phases";
import { getSession } from "@/lib/session";

type ActionResult =
  | { success: true; message: string; data?: Record<string, unknown> }
  | { success: false; error: string; data?: Record<string, unknown> };

const UI_LANGS = ["es", "en"] as const;
const PHASE_SEQUENCE = [1, 2, 3, 4, 5, 6] as const;

function revalidatePhaseWorkspaceSurfaces(phaseNumber?: number) {
  for (const lang of UI_LANGS) {
    revalidatePath(`/${lang}/dashboard`);
    revalidatePath(`/${lang}/cohort`);
    revalidatePath(`/${lang}/deliverables`);
    revalidatePath(`/${lang}/phases`);
    if (phaseNumber) {
      revalidatePath(`/${lang}/phases/${phaseNumber}`);
    } else {
      for (const phase of PHASE_SEQUENCE) {
        revalidatePath(`/${lang}/phases/${phase}`);
      }
    }
  }
}

function mapActionError(err: unknown): { error: string; data?: Record<string, unknown> } {
  if (err instanceof PhaseGateError) {
    return {
      error: err.message,
      data: { code: err.code, ...err.details },
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { error: message };
}

export async function requestReviewAction(
  organizationId: string,
  phaseNumber: number,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase",
        targetEntityId: String(phaseNumber),
        reason: "phase_review_request_forbidden",
      });
      return {
        success: false,
        error: "Solo administradores de ONG pueden solicitar revision.",
      };
    }

    if (session.organizationId !== organizationId) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase",
        targetEntityId: String(phaseNumber),
        reason: "phase_review_request_scope_forbidden",
      });
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    await requestPhaseReview(organizationId, phaseNumber);
    await writeAuditEvent({
      eventKey: "phase.review.requested",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "phase",
      targetEntityId: String(phaseNumber),
    });

    revalidatePhaseWorkspaceSurfaces(phaseNumber);

    return {
      success: true,
      message: `Fase ${phaseNumber} enviada para revision.`,
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function approvePhaseAction(
  organizationId: string,
  phaseNumber: number,
  feedback?: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    if (!hasPermission(session.role, "canApprovePhases")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase",
        targetEntityId: String(phaseNumber),
        reason: "phase_approve_forbidden",
      });
      return { success: false, error: "Solo facilitadores pueden aprobar fases." };
    }

    const result = await approvePhase(
      organizationId,
      phaseNumber,
      session.id,
      feedback,
    );
    await writeAuditEvent({
      eventKey: "phase.review.approved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "phase",
      targetEntityId: String(phaseNumber),
      metadata: {
        unlockedNext: result.unlockedNext,
        feedbackProvided: Boolean(feedback),
      },
    });

    revalidatePhaseWorkspaceSurfaces(phaseNumber);

    return {
      success: true,
      message: result.unlockedNext
        ? `Fase ${phaseNumber} aprobada. Fase ${phaseNumber + 1} desbloqueada.`
        : `Fase ${phaseNumber} aprobada. Todas las fases completadas.`,
      data: { unlockedNext: result.unlockedNext },
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function rejectPhaseAction(
  organizationId: string,
  phaseNumber: number,
  feedback: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    if (!hasPermission(session.role, "canApprovePhases")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase",
        targetEntityId: String(phaseNumber),
        reason: "phase_reject_forbidden",
      });
      return { success: false, error: "Solo facilitadores pueden rechazar fases." };
    }

    if (!feedback || feedback.trim().length === 0) {
      return {
        success: false,
        error: "Debes proveer retroalimentacion al rechazar una fase.",
      };
    }

    await rejectPhase(organizationId, phaseNumber, session.id, feedback);
    await writeAuditEvent({
      eventKey: "phase.review.rejected",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "phase",
      targetEntityId: String(phaseNumber),
      metadata: {
        feedbackProvided: true,
      },
    });

    revalidatePhaseWorkspaceSurfaces(phaseNumber);

    return {
      success: true,
      message: `Fase ${phaseNumber} devuelta con retroalimentacion.`,
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function checkPhaseAccessAction(
  organizationId: string,
  targetPhase: number,
): Promise<ActionResult> {
  try {
    const result = await canAccessPhase(organizationId, targetPhase);

    if (!result.allowed) {
      return {
        success: false,
        error: result.reason || "Acceso denegado.",
        data: {
          currentPhase: result.currentPhase,
          missingOutputs: result.missingOutputs ?? [],
          code: "PHASE_ACCESS_BLOCKED",
        },
      };
    }

    return {
      success: true,
      message: "Acceso permitido.",
      data: { currentPhase: result.currentPhase },
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function getPhaseStatusAction(organizationId: string) {
  try {
    const status = await getPhaseStatus(organizationId);
    if (!status) {
      return { success: false as const, error: "No se encontro el rastreador de fases." };
    }
    return { success: true as const, data: status };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false as const, error: mapped.error, data: mapped.data };
  }
}

export async function initializePhasesAction(
  organizationId: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    if (session.role !== ROLES.FACILITATOR) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase_tracker",
        reason: "phase_initialize_forbidden",
      });
      return { success: false, error: "No tienes permiso para inicializar organizaciones." };
    }

    await initializePhases(organizationId);
    await writeAuditEvent({
      eventKey: "phase.tracker.initialized",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "phase_tracker",
      targetEntityId: organizationId,
    });

    return {
      success: true,
      message: "Fases inicializadas. Fase 1 desbloqueada.",
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function getPhaseOutputStatusAction(
  organizationId: string,
  phaseNumber: number,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (session.organizationId !== organizationId && !hasPermission(session.role, "canViewAllOrgs")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "phase_output",
        targetEntityId: String(phaseNumber),
        reason: "phase_output_status_forbidden",
      });
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const summary = await getPhaseOutputStatus(organizationId, phaseNumber);
    return {
      success: true,
      message: "Estado de entregables de fase cargado.",
      data: {
        phaseNumber,
        ...summary,
      },
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function setPhaseOutputCompletionAction(input: {
  organizationId: string;
  phaseNumber: number;
  outputKey: string;
  isCompleted: boolean;
}): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: input.organizationId,
        targetEntityType: "phase_output",
        targetEntityId: `${input.phaseNumber}:${input.outputKey}`,
        reason: "phase_output_update_forbidden",
      });
      return { success: false, error: "Solo administradores de ONG pueden editar salidas de fase." };
    }
    if (session.organizationId !== input.organizationId) {
      await writeDeniedAccessEvent({
        session,
        organizationId: input.organizationId,
        targetEntityType: "phase_output",
        targetEntityId: `${input.phaseNumber}:${input.outputKey}`,
        reason: "phase_output_update_scope_forbidden",
      });
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const result = await updatePhaseOutputStatus({
      organizationId: input.organizationId,
      phaseNumber: input.phaseNumber,
      outputKey: input.outputKey,
      isCompleted: input.isCompleted,
      completedById: session.id,
    });
    await writeAuditEvent({
      eventKey: "phase.output.updated",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: input.organizationId,
      targetEntityType: "phase_output",
      targetEntityId: `${input.phaseNumber}:${input.outputKey}`,
      metadata: {
        isCompleted: input.isCompleted,
      },
    });

    revalidatePhaseWorkspaceSurfaces(input.phaseNumber);

    return {
      success: true,
      message: "Salida de fase actualizada.",
      data: {
        output: result.completion,
        summary: result.summary,
      },
    };
  } catch (err) {
    const mapped = mapActionError(err);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}
