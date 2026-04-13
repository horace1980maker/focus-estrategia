import { prisma } from './src/lib/prisma';
import { syncValidationOutputCompletion } from './src/lib/validation-readiness-sync';

/**
 * Simulate an NGO admin filling in validation data:
 * 1. Save feedback response
 * 2. Add 2 signatures
 * 3. Sync readiness outputs
 * Then request review for Phase 5.
 */
async function run() {
  const orgId = "cmnkvmms1000afo6zyt6awe57";
  const userId = "user-001"; // María García, ngo_admin

  // 1. Save feedback response
  await prisma.validationFeedbackResponse.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      response: "La organización ha revisado y acepta el plan estratégico. Se acuerda implementación inmediata.",
      submittedById: userId,
    },
    update: {
      response: "La organización ha revisado y acepta el plan estratégico. Se acuerda implementación inmediata.",
      submittedById: userId,
    }
  });
  console.log("✓ Feedback response saved");

  // 2. Add 2 signatures
  await prisma.validationSignoff.create({
    data: {
      organizationId: orgId,
      signerName: "María García",
      signerRole: "Directora Ejecutiva",
      signedById: userId,
    },
  });
  await prisma.validationSignoff.create({
    data: {
      organizationId: orgId,
      signerName: "Carlos López",
      signerRole: "Presidente de Junta",
      signedById: userId,
    },
  });
  console.log("✓ 2 signatures added");

  // 3. Sync readiness to update output completions
  const readiness = await syncValidationOutputCompletion(orgId);
  console.log("✓ Readiness synced:", JSON.stringify(readiness, null, 2));

  // 4. Request review for Phase 5 (set status to review_requested)
  const tracker = await prisma.phaseTracker.findUnique({
    where: { organizationId: orgId },
    include: { phases: { where: { phaseNumber: 5 } } }
  });

  const phase5 = tracker?.phases[0];
  if (phase5 && phase5.status === "in_progress") {
    await prisma.phase.update({
      where: { id: phase5.id },
      data: { status: "review_requested" }
    });
    console.log("✓ Phase 5 → review_requested");
  } else {
    console.log(`Phase 5 status is: ${phase5?.status} (not in_progress, skipping request review)`);
  }

  console.log("\nDone! Now switch MOCK_USER to 'facilitator' and go to /es/phases/5 to approve.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
