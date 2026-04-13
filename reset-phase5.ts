import { prisma } from './src/lib/prisma';

/**
 * Reset Phase 5 to in_progress so that:
 * 1. NGO admin can fill in validation feedback + signatures
 * 2. NGO admin requests review  
 * 3. Facilitator can approve/reject
 *
 * Also resets Phase 6 to locked (since Phase 5 is its prerequisite).
 */
async function run() {
  const orgId = "cmnkvmms1000afo6zyt6awe57";

  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: orgId },
    include: {
      phases: {
        where: { phaseNumber: { in: [5, 6] } },
        include: { reviews: true, outputCompletions: true }
      }
    }
  });

  if (!tracker) {
    console.log("No tracker found");
    return;
  }

  const phase5 = tracker.phases.find(p => p.phaseNumber === 5);
  const phase6 = tracker.phases.find(p => p.phaseNumber === 6);

  if (!phase5) {
    console.log("Phase 5 not found");
    return;
  }

  console.log(`Before: Phase 5 status=${phase5.status}, Phase 6 status=${phase6?.status}`);

  // Delete Phase 5 reviews (the premature approval)
  if (phase5.reviews.length > 0) {
    await prisma.phaseReview.deleteMany({
      where: { phaseId: phase5.id }
    });
    console.log(`  Deleted ${phase5.reviews.length} Phase 5 review(s)`);
  }

  // Reset Phase 5 output completions to false
  await prisma.phaseOutputCompletion.updateMany({
    where: { phaseId: phase5.id },
    data: { isCompleted: false, completedAt: null, completedById: null }
  });
  console.log("  Reset Phase 5 output completions to false");

  // Reset Phase 5 to in_progress
  await prisma.phase.update({
    where: { id: phase5.id },
    data: { status: "in_progress", completedAt: null }
  });
  console.log("  Phase 5 → in_progress");

  // Reset Phase 6 to locked
  if (phase6) {
    // Delete Phase 6 reviews too
    if (phase6.reviews.length > 0) {
      await prisma.phaseReview.deleteMany({
        where: { phaseId: phase6.id }
      });
      console.log(`  Deleted ${phase6.reviews.length} Phase 6 review(s)`);
    }

    await prisma.phaseOutputCompletion.updateMany({
      where: { phaseId: phase6.id },
      data: { isCompleted: false, completedAt: null, completedById: null }
    });

    await prisma.phase.update({
      where: { id: phase6.id },
      data: { status: "locked", completedAt: null, startedAt: null }
    });
    console.log("  Phase 6 → locked");
  }

  // Update tracker current phase to 5
  await prisma.phaseTracker.update({
    where: { organizationId: orgId },
    data: { currentPhase: 5 }
  });
  console.log("  Tracker currentPhase → 5");

  console.log("\nDone! Now:");
  console.log("  1. Switch to MOCK_USER=ngo-admin → fill validation feedback & signatures");
  console.log("  2. Click 'Request Review' on Phase 5");
  console.log("  3. Switch to MOCK_USER=facilitator → Approve Phase 5");
}

run().catch(console.error).finally(() => prisma.$disconnect());
