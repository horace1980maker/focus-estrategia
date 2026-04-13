import { prisma } from './src/lib/prisma';

async function run() {
  // Find the user the mock session creates
  const user = await prisma.user.findUnique({
    where: { email: "facilitador@focus.org" },
    select: { id: true, name: true, role: true, organizationId: true }
  });
  console.log("Facilitator user:", user);

  const ngoUser = await prisma.user.findUnique({
    where: { email: "director@ongejemplo.org" },
    select: { id: true, name: true, role: true, organizationId: true }
  });
  console.log("NGO Admin user:", ngoUser);

  if (ngoUser?.organizationId) {
    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: ngoUser.organizationId },
      include: {
        phases: {
          orderBy: { phaseNumber: "asc" },
          include: { outputCompletions: true, reviews: { orderBy: { createdAt: "desc" }, take: 1 } }
        }
      }
    });
    
    if (tracker) {
      console.log(`\nPhase Tracker for org ${ngoUser.organizationId}:`);
      console.log(`  Current Phase: ${tracker.currentPhase}`);
      for (const p of tracker.phases) {
        const outputStr = p.outputCompletions.map(o => `${o.outputKey}=${o.isCompleted}`).join(', ');
        const reviewStr = p.reviews.length > 0 ? `review=${p.reviews[0].decision}` : 'no review';
        console.log(`  Phase ${p.phaseNumber}: status=${p.status} | ${reviewStr} | outputs: [${outputStr}]`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
