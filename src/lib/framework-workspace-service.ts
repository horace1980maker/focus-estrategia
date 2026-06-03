import { type UserSession } from "./auth";
import { writeAuditEvent, writeDeniedAccessEvent } from "./audit";
import { AuthorizationError, requireOrganizationScope } from "./access-guards";
import { prisma } from "./prisma";
import { ensurePhaseOutputContracts } from "./phase-outputs";

async function assertFrameworkConfigWriteAccess(session: UserSession, organizationId: string) {
  if (session.role === "facilitator") {
    await requireOrganizationScope({
      session,
      organizationId,
      action: "write",
      allowFacilitatorWrite: true,
      context: {
        reason: "framework_config_scope_forbidden",
        targetEntityType: "framework_workspace",
        targetEntityId: organizationId,
      },
    });
    return;
  }

  await writeDeniedAccessEvent({
    session,
    organizationId,
    targetEntityType: "framework_workspace",
    reason: "framework_config_write_forbidden",
  });
  throw new AuthorizationError(
    "Only facilitator can update framework workspace links.",
    "ROLE_FORBIDDEN",
    403,
  );
}

export async function saveFrameworkWorkspace(input: {
  session: UserSession;
  organizationId: string;
  materialsFolderUrl?: string;
  materialsFolderUrl2?: string;
  materialsFolderUrl3?: string;
  materialsFolderUrl4?: string;
}) {
  await assertFrameworkConfigWriteAccess(input.session, input.organizationId);

  const dataToUpdate: any = {
    updatedById: input.session.id,
  };
  if (input.materialsFolderUrl !== undefined) {
    dataToUpdate.materialsFolderUrl = input.materialsFolderUrl.trim() || null;
  }
  if (input.materialsFolderUrl2 !== undefined) {
    dataToUpdate.materialsFolderUrl2 = input.materialsFolderUrl2.trim() || null;
  }
  if (input.materialsFolderUrl3 !== undefined) {
    dataToUpdate.materialsFolderUrl3 = input.materialsFolderUrl3.trim() || null;
  }
  if (input.materialsFolderUrl4 !== undefined) {
    dataToUpdate.materialsFolderUrl4 = input.materialsFolderUrl4.trim() || null;
  }

  const workspace = await prisma.frameworkWorkspace.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      materialsFolderUrl: input.materialsFolderUrl?.trim() || null,
      materialsFolderUrl2: input.materialsFolderUrl2?.trim() || null,
      materialsFolderUrl3: input.materialsFolderUrl3?.trim() || null,
      materialsFolderUrl4: input.materialsFolderUrl4?.trim() || null,
      updatedById: input.session.id,
    },
    update: dataToUpdate,
  });

  // Automatically update the PhaseOutputCompletion status for the updated link(s)
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: input.organizationId },
    include: { phases: true },
  });
  const phase3 = tracker?.phases.find((p) => p.phaseNumber === 3);
  if (phase3) {
    await ensurePhaseOutputContracts(phase3.id, 3);

    const updateCompletion = async (key: string, urlVal: string | undefined) => {
      if (urlVal === undefined) return;
      const isCompleted = !!urlVal.trim();
      await prisma.phaseOutputCompletion.update({
        where: {
          phaseId_outputKey: {
            phaseId: phase3.id,
            outputKey: key,
          },
        },
        data: {
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
          completedById: isCompleted ? input.session.id : null,
        },
      }).catch((err) => {
        console.error(`Failed to update completion for ${key}:`, err);
      });
    };

    await updateCompletion("materials", input.materialsFolderUrl);
    await updateCompletion("materials-session-2", input.materialsFolderUrl2);
    await updateCompletion("materials-session-3", input.materialsFolderUrl3);
    await updateCompletion("materials-session-4", input.materialsFolderUrl4);
  }

  await writeAuditEvent({
    eventKey: "framework.workspace.saved",
    eventType: "mutation",
    actorId: input.session.id,
    actorRole: input.session.role,
    organizationId: input.organizationId,
    targetEntityType: "framework_workspace",
    targetEntityId: workspace.id,
  });

  return workspace;
}
