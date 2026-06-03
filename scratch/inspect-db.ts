import { prisma } from "../src/lib/prisma";

async function main() {
  const orgId = "org-hardening-07";
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: orgId },
    include: {
      phases: {
        where: { phaseNumber: 3 },
        include: {
          outputCompletions: true,
        },
      },
    },
  });

  console.log("Tracker for org-hardening-07 Phase 3:");
  console.log(JSON.stringify(tracker, null, 2));
}

main().catch(console.error);
