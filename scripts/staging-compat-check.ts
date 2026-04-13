import * as db from "../src/lib/prisma.ts";

const prisma = db.prisma;

type MissingPhaseRow = { phaseTrackerId: string };
type LowConfidenceRow = {
  organizationId: string;
  previousCurrentPhase: number;
  mappedCurrentPhase: number;
  reason: string;
  createdAt: Date;
};

async function run() {
  const [organizationCount, lowConfidenceRows, trackerOutOfBoundsCount, missingDeliverablesPhaseRows] =
    await Promise.all([
      prisma.organization.count(),
      prisma.phaseMigrationAudit.findMany({
        where: { confidence: "low" },
        select: {
          organizationId: true,
          previousCurrentPhase: true,
          mappedCurrentPhase: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.phaseTracker.count({
        where: {
          OR: [{ currentPhase: { lt: 1 } }, { currentPhase: { gt: 6 } }],
        },
      }),
      prisma.$queryRaw<MissingPhaseRow[]>`
        SELECT pt."id" AS "phaseTrackerId"
        FROM "PhaseTracker" pt
        LEFT JOIN "Phase" p
          ON p."phaseTrackerId" = pt."id"
         AND p."phaseNumber" = 6
        WHERE p."id" IS NULL
      `,
    ]);

  const report = {
    organizationCount,
    lowConfidenceAuditCount: lowConfidenceRows.length,
    trackerOutOfBoundsCount,
    missingDeliverablesPhaseCount: missingDeliverablesPhaseRows.length,
    sampledMissingDeliverablesTrackers: missingDeliverablesPhaseRows.slice(0, 5),
    sampledLowConfidenceAudits: lowConfidenceRows
      .slice(0, 5)
      .map((row: LowConfidenceRow) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
  };

  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((error) => {
    console.error("staging-compat-check failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
