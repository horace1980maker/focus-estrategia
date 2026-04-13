const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: "org-001" },
    include: {
      phases: {
        where: { phaseNumber: 5 },
        include: {
          outputs: true,
        }
      }
    }
  });

  const p5 = tracker.phases[0];
  console.log("Phase 5 DB Status:", p5.status);
  console.log("Phase 5 Outputs:");
  p5.outputs.forEach(o => {
    console.log(`  ${o.outputKey}: isRequired=${o.isRequired}, isCompleted=${o.isCompleted}`);
  });
}

run().catch(console.error).finally(() => prisma.$disconnect());
