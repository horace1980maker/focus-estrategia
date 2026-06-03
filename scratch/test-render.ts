import PhaseWorkspaceShell from "../src/components/PhaseWorkspaceShell";

async function testRender() {
  console.log("Starting test render as ngo_admin...");
  try {
    const jsx = await PhaseWorkspaceShell({
      lang: "es",
      organizationId: "org-hardening-07",
      phaseNumber: 3,
      phaseName: "Marco Estratégico",
      phaseStatus: "in_progress",
      currentPhase: 3,
      canEditOutputs: true,
      canApprovePhases: false,
      activeRole: "ngo_admin",
    });
    console.log("Successfully rendered as ngo_admin!");
  } catch (err) {
    console.error("Error rendering as ngo_admin:", err);
  }

  console.log("\nStarting test render as facilitator...");
  try {
    const jsx = await PhaseWorkspaceShell({
      lang: "es",
      organizationId: "org-hardening-07",
      phaseNumber: 3,
      phaseName: "Marco Estratégico",
      phaseStatus: "in_progress",
      currentPhase: 3,
      canEditOutputs: false,
      canApprovePhases: true,
      activeRole: "facilitator",
    });
    console.log("Successfully rendered as facilitator!");
  } catch (err) {
    console.error("Error rendering as facilitator:", err);
  }
}

testRender().catch(console.error);
