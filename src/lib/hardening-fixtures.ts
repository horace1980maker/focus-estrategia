import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { initializePhases } from "./phases";
import { hashPassword } from "./security";

type OrganizationFixture = {
  ordinal: number;
  id: string;
  name: string;
  country: string;
  adminUsername: string;
};

const DEFAULT_PASSWORD = "TempPass123!";
const CSV_CANDIDATE_PATHS = [
  process.env.HARDENING_ORGS_CSV,
  path.resolve(process.cwd(), "organizaciones.csv"),
  path.resolve(process.cwd(), "..", "organizaciones.csv"),
].filter((candidate): candidate is string => Boolean(candidate && candidate.trim().length > 0));

function toStableOrgId(index: number): string {
  return `org-hardening-${String(index).padStart(2, "0")}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseCsvRows(content: string): Array<{ name: string; country: string }> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    const name = parts[1]?.trim() ?? "Organization";
    const country = parts[2]?.trim() ?? "Unknown";
    return { name, country };
  });
}

export async function loadHardeningOrganizationFixtures(): Promise<OrganizationFixture[]> {
  let csvContent = "";
  for (const csvPath of CSV_CANDIDATE_PATHS) {
    try {
      csvContent = await fs.readFile(csvPath, "utf-8");
      break;
    } catch {
      // Continue trying the next candidate path.
    }
  }

  if (!csvContent) {
    return [];
  }

  const rows = parseCsvRows(csvContent).slice(0, 10);
  return rows.map((row, index) => {
    const ordinal = index + 1;
    const id = toStableOrgId(ordinal);
    const slug = slugify(row.name);
    return {
      ordinal,
      id,
      name: row.name,
      country: row.country,
      adminUsername: `${slug || `org-${ordinal}`}-admin`,
    };
  });
}

export async function seedHardeningFixtures() {
  const fixtures = await loadHardeningOrganizationFixtures();
  if (fixtures.length === 0) {
    return {
      organizations: [],
      facilitatorId: null,
      coordinatorId: null,
    };
  }

  for (const fixture of fixtures) {
    await prisma.organization.upsert({
      where: { id: fixture.id },
      create: {
        id: fixture.id,
        name: fixture.name,
        country: fixture.country,
        description: `Hardening fixture organization (${fixture.country})`,
      },
      update: {
        name: fixture.name,
        country: fixture.country,
        description: `Hardening fixture organization (${fixture.country})`,
      },
    });

    const tracker = await prisma.phaseTracker.findUnique({
      where: { organizationId: fixture.id },
      select: { id: true },
    });
    if (!tracker) {
      await initializePhases(fixture.id);
    }

    await prisma.user.upsert({
      where: { username: fixture.adminUsername },
      create: {
        email: fixture.adminUsername,
        username: fixture.adminUsername,
        name: `${fixture.name} Admin`,
        role: "ngo_admin",
        organizationId: fixture.id,
        passwordHash: hashPassword(DEFAULT_PASSWORD),
        mustChangePassword: true,
        isActive: true,
      },
      update: {
        email: fixture.adminUsername,
        name: `${fixture.name} Admin`,
        role: "ngo_admin",
        organizationId: fixture.id,
        isActive: true,
      },
    });
  }

  const facilitator = await prisma.user.upsert({
    where: { username: "facilitator-hardening" },
    create: {
      email: "facilitator-hardening",
      username: "facilitator-hardening",
      name: "Hardening Facilitator",
      role: "facilitator",
      organizationId: null,
      passwordHash: hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: true,
      isActive: true,
    },
    update: {
      name: "Hardening Facilitator",
      role: "facilitator",
      organizationId: null,
      isActive: true,
    },
  });

  const coordinator = await prisma.user.upsert({
    where: { username: "focus-hardening" },
    create: {
      email: "focus-hardening",
      username: "focus-hardening",
      name: "Hardening Focus Coordinator",
      role: "focus_coordinator",
      organizationId: null,
      passwordHash: hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: true,
      isActive: true,
    },
    update: {
      name: "Hardening Focus Coordinator",
      role: "focus_coordinator",
      organizationId: null,
      isActive: true,
    },
  });

  return {
    organizations: fixtures,
    facilitatorId: facilitator.id,
    coordinatorId: coordinator.id,
  };
}
