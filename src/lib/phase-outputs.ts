import { prisma } from "./prisma";
import { getOutputContractsForPhaseNumber } from "./phase-output-contracts";

export type MissingPhaseOutput = {
  outputKey: string;
  outputLabel: string;
};

export type PhaseOutputState = {
  outputKey: string;
  outputLabel: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: Date | null;
  completedById: string | null;
};

export type PhaseOutputSummary = {
  requiredCount: number;
  completedCount: number;
  missingOutputs: MissingPhaseOutput[];
  outputs: PhaseOutputState[];
};

export async function ensurePhaseOutputContracts(
  phaseId: string,
  phaseNumber: number,
) {
  const contracts = getOutputContractsForPhaseNumber(phaseNumber);
  for (const contract of contracts) {
    await prisma.phaseOutputCompletion.upsert({
      where: {
        phaseId_outputKey: {
          phaseId,
          outputKey: contract.key,
        },
      },
      create: {
        phaseId,
        outputKey: contract.key,
        outputLabel: contract.label,
        isRequired: true,
      },
      update: {
        outputLabel: contract.label,
        isRequired: true,
      },
    });
  }

  return prisma.phaseOutputCompletion.findMany({
    where: { phaseId, isRequired: true },
    orderBy: { outputKey: "asc" },
  });
}

export function summarizePhaseOutputs(
  outputs: Array<{
    outputKey: string;
    outputLabel: string;
    isRequired: boolean;
    isCompleted: boolean;
    completedAt: Date | null;
    completedById: string | null;
  }>,
): PhaseOutputSummary {
  const requiredOutputs = outputs.filter((output) => output.isRequired);
  const completedCount = requiredOutputs.filter((output) => output.isCompleted).length;
  const missingOutputs = requiredOutputs
    .filter((output) => !output.isCompleted)
    .map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
    }));

  return {
    requiredCount: requiredOutputs.length,
    completedCount,
    missingOutputs,
    outputs: requiredOutputs.map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      isRequired: output.isRequired,
      isCompleted: output.isCompleted,
      completedAt: output.completedAt,
      completedById: output.completedById,
    })),
  };
}

export async function getPhaseOutputSummary(
  phaseId: string,
  phaseNumber: number,
): Promise<PhaseOutputSummary> {
  const outputs = await ensurePhaseOutputContracts(phaseId, phaseNumber);
  return summarizePhaseOutputs(outputs);
}

export async function setPhaseOutputCompletion(input: {
  phaseId: string;
  phaseNumber: number;
  outputKey: string;
  isCompleted: boolean;
  completedById?: string;
}) {
  await ensurePhaseOutputContracts(input.phaseId, input.phaseNumber);

  const now = new Date();
  const completion = await prisma.phaseOutputCompletion.update({
    where: {
      phaseId_outputKey: {
        phaseId: input.phaseId,
        outputKey: input.outputKey,
      },
    },
    data: {
      isCompleted: input.isCompleted,
      completedAt: input.isCompleted ? now : null,
      completedById: input.isCompleted ? input.completedById ?? null : null,
    },
  });

  const summary = await getPhaseOutputSummary(input.phaseId, input.phaseNumber);
  return {
    completion,
    summary,
  };
}
