"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { syncDraftOutputCompletion } from "@/lib/draft-readiness-sync";

type ActionResult =
  | { success: true; message: string; data?: Record<string, unknown> }
  | { success: false; error: string; data?: Record<string, unknown> };

function revalidateDraftPaths() {
  revalidatePath("/es/phases/4");
  revalidatePath("/en/phases/4");
  revalidatePath("/es/dashboard");
  revalidatePath("/en/dashboard");
}

// ── 3.1  Save / upsert DraftObjectiveResult ──────────────────────

export async function saveDraftObjectiveResultAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    const organizationId = formData.get("organizationId") as string;

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "draft_objective_result",
        reason: "draft_edit_forbidden",
      });
      return { success: false, error: "No tienes permiso para editar el borrador." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const id = formData.get("id") as string | null;
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const expectedResults = (formData.get("expectedResults") as string) || "";
    const owner = (formData.get("owner") as string) || "";
    const timelineStartRaw = formData.get("timelineStart") as string;
    const timelineEndRaw = formData.get("timelineEnd") as string;
    const sourceObjectiveId = (formData.get("sourceObjectiveId") as string) || null;

    const timelineStart = timelineStartRaw ? new Date(timelineStartRaw) : null;
    const timelineEnd = timelineEndRaw ? new Date(timelineEndRaw) : null;

    if (id) {
      await prisma.draftObjectiveResult.update({
        where: { id },
        data: { title, description, expectedResults, owner, timelineStart, timelineEnd },
      });
    } else {
      const count = await prisma.draftObjectiveResult.count({ where: { organizationId } });
      await prisma.draftObjectiveResult.create({
        data: {
          organizationId,
          sourceObjectiveId,
          title,
          description,
          expectedResults,
          owner,
          timelineStart,
          timelineEnd,
          orderIndex: count,
        },
      });
    }

    await syncDraftOutputCompletion(organizationId);
    await writeAuditEvent({
      eventKey: "draft.objective_result.saved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "draft_objective_result",
    });

    revalidateDraftPaths();
    return { success: true, message: "Objetivo y resultado guardado." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ── 3.2  Save / upsert DraftLineOfAction ─────────────────────────

export async function saveDraftLineOfActionAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    const organizationId = formData.get("organizationId") as string;

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "draft_line_of_action",
        reason: "draft_edit_forbidden",
      });
      return { success: false, error: "No tienes permiso para editar el borrador." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const id = formData.get("id") as string | null;
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const initiativesRaw = (formData.get("initiatives") as string) || "";
    const objectiveResultId = (formData.get("objectiveResultId") as string) || null;
    const timelineStartRaw = formData.get("timelineStart") as string;
    const timelineEndRaw = formData.get("timelineEnd") as string;

    // Parse comma-separated initiatives into JSON array
    const initiatives = initiativesRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const initiativesJson = JSON.stringify(initiatives);

    const timelineStart = timelineStartRaw ? new Date(timelineStartRaw) : null;
    const timelineEnd = timelineEndRaw ? new Date(timelineEndRaw) : null;

    if (id) {
      await prisma.draftLineOfAction.update({
        where: { id },
        data: {
          title,
          description,
          initiativesJson,
          objectiveResultId,
          timelineStart,
          timelineEnd,
        },
      });
    } else {
      const count = await prisma.draftLineOfAction.count({ where: { organizationId } });
      await prisma.draftLineOfAction.create({
        data: {
          organizationId,
          objectiveResultId,
          title,
          description,
          initiativesJson,
          timelineStart,
          timelineEnd,
          orderIndex: count,
        },
      });
    }

    await syncDraftOutputCompletion(organizationId);
    await writeAuditEvent({
      eventKey: "draft.line_of_action.saved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "draft_line_of_action",
    });

    revalidateDraftPaths();
    return { success: true, message: "Linea de accion guardada." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ── 3.3  Save DraftAssumptionRisk ────────────────────────────────

export async function saveDraftAssumptionRiskAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    const organizationId = formData.get("organizationId") as string;

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "draft_assumption_risk",
        reason: "draft_edit_forbidden",
      });
      return { success: false, error: "No tienes permiso para editar el borrador." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const id = formData.get("id") as string | null;
    const type = formData.get("type") as string;
    const description = (formData.get("description") as string) || "";
    const category = (formData.get("category") as string) || null;
    const mitigation = (formData.get("mitigation") as string) || null;

    if (type !== "assumption" && type !== "risk") {
      return { success: false, error: "Tipo debe ser 'assumption' o 'risk'." };
    }

    if (id) {
      await prisma.draftAssumptionRisk.update({
        where: { id },
        data: { type, description, category, mitigation },
      });
    } else {
      const count = await prisma.draftAssumptionRisk.count({ where: { organizationId } });
      await prisma.draftAssumptionRisk.create({
        data: {
          organizationId,
          type,
          description,
          category,
          mitigation,
          orderIndex: count,
        },
      });
    }

    await syncDraftOutputCompletion(organizationId);
    await writeAuditEvent({
      eventKey: "draft.assumption_risk.saved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "draft_assumption_risk",
      metadata: { type },
    });

    revalidateDraftPaths();
    return { success: true, message: type === "assumption" ? "Supuesto guardado." : "Riesgo guardado." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ── 3.4  Save DraftSnapshot ──────────────────────────────────────

export async function saveDraftSnapshotAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    const organizationId = formData.get("organizationId") as string;

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "draft_snapshot",
        reason: "draft_edit_forbidden",
      });
      return { success: false, error: "No tienes permiso para editar el borrador." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    const content = (formData.get("content") as string) || "";
    if (!content.trim()) {
      return { success: false, error: "El contenido de la narrativa no puede estar vacio." };
    }

    // Get the latest version number
    const latest = await prisma.draftSnapshot.findFirst({
      where: { organizationId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    await prisma.draftSnapshot.create({
      data: {
        organizationId,
        versionNumber: nextVersion,
        content,
        createdById: session.id,
      },
    });

    await syncDraftOutputCompletion(organizationId);
    await writeAuditEvent({
      eventKey: "draft.snapshot.created",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "draft_snapshot",
      metadata: { versionNumber: nextVersion },
    });

    revalidateDraftPaths();
    return { success: true, message: `Version ${nextVersion} guardada.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ── 3.5  Delete draft entry ──────────────────────────────────────

export async function deleteDraftEntryAction(
  entityType: "objective_result" | "line_of_action" | "assumption_risk",
  entityId: string,
  organizationId: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();

    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: `draft_${entityType}`,
        targetEntityId: entityId,
        reason: "draft_delete_forbidden",
      });
      return { success: false, error: "No tienes permiso para eliminar esta entrada." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    switch (entityType) {
      case "objective_result":
        await prisma.draftObjectiveResult.delete({ where: { id: entityId } });
        break;
      case "line_of_action":
        await prisma.draftLineOfAction.delete({ where: { id: entityId } });
        break;
      case "assumption_risk":
        await prisma.draftAssumptionRisk.delete({ where: { id: entityId } });
        break;
    }

    await syncDraftOutputCompletion(organizationId);
    await writeAuditEvent({
      eventKey: `draft.${entityType}.deleted`,
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: `draft_${entityType}`,
      targetEntityId: entityId,
    });

    revalidateDraftPaths();
    return { success: true, message: "Entrada eliminada." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}

// ── 3.6  Get draft readiness ─────────────────────────────────────

export async function getDraftReadinessAction(
  organizationId: string,
) {
  try {
    const session = await getSession();
    if (
      session.organizationId !== organizationId &&
      !hasPermission(session.role, "canViewAllOrgs")
    ) {
      return { success: false as const, error: "No tienes acceso a esta organizacion." };
    }

    const readiness = await syncDraftOutputCompletion(organizationId);
    return { success: true as const, data: readiness };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false as const, error: message };
  }
}

// ── 3.7  Seed draft from Phase 3 framework ───────────────────────

export async function seedDraftFromFrameworkAction(
  organizationId: string,
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!hasPermission(session.role, "canEditOrgData")) {
      return { success: false, error: "No tienes permiso para inicializar el borrador." };
    }
    if (session.organizationId !== organizationId) {
      return { success: false, error: "No tienes acceso a esta organizacion." };
    }

    // Only seed if no draft objectives exist yet
    const existingCount = await prisma.draftObjectiveResult.count({
      where: { organizationId },
    });
    if (existingCount > 0) {
      return { success: true, message: "El borrador ya fue inicializado." };
    }

    const objectives = await prisma.strategicObjective.findMany({
      where: { organizationId },
      orderBy: { priority: "asc" },
    });

    if (objectives.length === 0) {
      return {
        success: true,
        message: "No hay objetivos estrategicos en el marco para pre-cargar.",
      };
    }

    for (let i = 0; i < objectives.length; i++) {
      await prisma.draftObjectiveResult.create({
        data: {
          organizationId,
          sourceObjectiveId: objectives[i].id,
          title: objectives[i].title,
          description: objectives[i].description ?? "",
          orderIndex: i,
        },
      });
    }

    await writeAuditEvent({
      eventKey: "draft.seeded_from_framework",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "draft_objective_result",
      metadata: { seededCount: objectives.length },
    });

    revalidateDraftPaths();
    return {
      success: true,
      message: `${objectives.length} objetivos pre-cargados desde el marco estrategico.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: message };
  }
}
