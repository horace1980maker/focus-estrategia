"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "@/lib/audit";
import {
  DeliverableError,
  approveDeliverableVersion,
  createOrRegenerateDeliverableVersion,
  listDeliverableVersions,
  publishDeliverableVersion,
  refreshDeliverableReadiness,
  requestDeliverableExport,
  submitDeliverableForReview,
} from "@/lib/deliverables";
import { getSession } from "@/lib/session";

type DeliverableActionResult =
  | { success: true; message: string; data?: Record<string, unknown> }
  | { success: false; error: string; data?: Record<string, unknown> };

function mapError(error: unknown): { error: string; data?: Record<string, unknown> } {
  if (error instanceof DeliverableError) {
    return {
      error: error.message,
      data: { code: error.code, ...error.details },
    };
  }
  return {
    error: error instanceof Error ? error.message : "Deliverable operation failed.",
  };
}

function revalidateDeliverablesViews() {
  revalidatePath("/es/phases/6");
  revalidatePath("/en/phases/6");
  revalidatePath("/es/dashboard");
  revalidatePath("/en/dashboard");
  revalidatePath("/es/cohort");
  revalidatePath("/en/cohort");
}

export async function listDeliverableVersionsAction(): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_list_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }

    const versions = await listDeliverableVersions(session.organizationId);
    return {
      success: true,
      message: "Deliverable versions loaded.",
      data: { versions },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function createOrRegenerateDeliverableAction(): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_generate_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        reason: "deliverable_generate_forbidden",
      });
      return { success: false, error: "Only NGO admins can generate deliverables." };
    }

    const result = await createOrRegenerateDeliverableVersion({
      organizationId: session.organizationId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.regenerated",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: result.deliverable.id,
      metadata: {
        versionNumber: result.deliverable.versionNumber,
      },
    });
    revalidateDeliverablesViews();
    return {
      success: true,
      message: "Deliverable version generated.",
      data: {
        deliverable: result.deliverable,
        readinessStatus: result.readinessStatus,
      },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function refreshDeliverableReadinessAction(): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_readiness_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }
    const result = await refreshDeliverableReadiness(session.organizationId);
    revalidateDeliverablesViews();
    return {
      success: true,
      message: "Deliverable readiness refreshed.",
      data: result,
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function submitDeliverableForReviewAction(
  deliverableId: string,
): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_submit_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_submit_forbidden",
      });
      return { success: false, error: "Only NGO admins can submit deliverables for review." };
    }

    const deliverable = await submitDeliverableForReview({
      organizationId: session.organizationId,
      deliverableId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.submitted_for_review",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverable.id,
    });
    revalidateDeliverablesViews();
    return {
      success: true,
      message: "Deliverable submitted for review.",
      data: { deliverable },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function approveDeliverableAction(
  organizationId: string,
  deliverableId: string,
): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!hasPermission(session.role, "canApprovePhases")) {
      await writeDeniedAccessEvent({
        session,
        organizationId,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_approve_forbidden",
      });
      return { success: false, error: "Only facilitators can approve deliverables." };
    }

    const deliverable = await approveDeliverableVersion({
      organizationId,
      deliverableId,
      reviewerId: session.id,
    });
    await writeAuditEvent({
      eventKey: "deliverable.approved",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverable.id,
    });
    revalidateDeliverablesViews();
    return {
      success: true,
      message: "Deliverable approved.",
      data: { deliverable, reviewerId: session.id },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function publishDeliverableAction(
  deliverableId: string,
): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_publish_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }
    if (!hasPermission(session.role, "canEditOrgData")) {
      await writeDeniedAccessEvent({
        session,
        organizationId: session.organizationId,
        targetEntityType: "deliverable",
        targetEntityId: deliverableId,
        reason: "deliverable_publish_forbidden",
      });
      return { success: false, error: "Only NGO admins can publish deliverables." };
    }

    const deliverable = await publishDeliverableVersion({
      organizationId: session.organizationId,
      deliverableId,
    });
    await writeAuditEvent({
      eventKey: "deliverable.published",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: deliverable.id,
    });
    revalidateDeliverablesViews();
    return {
      success: true,
      message: "Deliverable published.",
      data: { deliverable },
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}

export async function requestDeliverableExportAction(input: {
  deliverableId: string;
  format: "pdf" | "docx";
}): Promise<DeliverableActionResult> {
  try {
    const session = await getSession();
    if (!session.organizationId) {
      await writeDeniedAccessEvent({
        session,
        targetEntityType: "deliverable",
        reason: "deliverable_export_missing_org_context",
      });
      return { success: false, error: "No organization context found." };
    }

    const result = await requestDeliverableExport({
      organizationId: session.organizationId,
      deliverableId: input.deliverableId,
      format: input.format,
    });
    await writeAuditEvent({
      eventKey: "deliverable.export.requested",
      eventType: "mutation",
      actorId: session.id,
      actorRole: session.role,
      organizationId: session.organizationId,
      targetEntityType: "deliverable",
      targetEntityId: input.deliverableId,
      metadata: {
        format: input.format,
        reused: result.reused,
      },
    });
    revalidateDeliverablesViews();
    return {
      success: true,
      message: result.reused
        ? "Existing export reused."
        : "Export generated.",
      data: result,
    };
  } catch (error) {
    const mapped = mapError(error);
    return { success: false, error: mapped.error, data: mapped.data };
  }
}
