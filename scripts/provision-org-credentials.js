const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID, scryptSync } = require("node:crypto");
const Database = require("better-sqlite3");

const DB_PATH = path.resolve(__dirname, "..", "prisma", "dev.db");
const CSV_PATH = path.resolve(__dirname, "..", "..", "organizaciones.csv");
const DEFAULT_PASSWORD = process.env.ORG_DEFAULT_PASSWORD ?? "DemoPass2026!";
const PHASE_KEYS = [
  "onboarding",
  "diagnosis",
  "framework",
  "draft",
  "validation",
  "deliverables",
];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `v1:${salt}:${hash}`;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseCsv(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(1)
    .map((line, index) => {
      const columns = line.split(",");
      const rawName = columns[1]?.trim();
      const rawCountry = columns[2]?.trim();
      if (!rawName) {
        throw new Error(`Row ${index + 2} in organizaciones.csv has no organization name.`);
      }
      return {
        name: rawName,
        country: rawCountry || null,
      };
    });
}

function ensureOrganization(db, organization) {
  const existing = db
    .prepare('SELECT id FROM "Organization" WHERE lower(name) = lower(?) LIMIT 1')
    .get(organization.name);

  const now = new Date().toISOString();
  if (existing?.id) {
    db.prepare(
      'UPDATE "Organization" SET country = ?, description = ?, updatedAt = ? WHERE id = ?',
    ).run(
      organization.country,
      `Provisioned from organizaciones.csv (${organization.country ?? "Unknown country"})`,
      now,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO "Organization" (id, name, country, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    organization.name,
    organization.country,
    `Provisioned from organizaciones.csv (${organization.country ?? "Unknown country"})`,
    now,
    now,
  );
  return id;
}

function ensurePhaseTracker(db, organizationId) {
  const existing = db
    .prepare('SELECT id FROM "PhaseTracker" WHERE organizationId = ? LIMIT 1')
    .get(organizationId);

  if (existing?.id) {
    return existing.id;
  }

  const now = new Date().toISOString();
  const phaseTrackerId = randomUUID();
  db.prepare(
    'INSERT INTO "PhaseTracker" (id, organizationId, currentPhase, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)',
  ).run(phaseTrackerId, organizationId, now, now);
  return phaseTrackerId;
}

function ensurePhases(db, phaseTrackerId) {
  const now = new Date().toISOString();

  for (let index = 0; index < PHASE_KEYS.length; index += 1) {
    const phaseNumber = index + 1;
    const phaseKey = PHASE_KEYS[index];
    const existing = db
      .prepare(
        'SELECT id FROM "Phase" WHERE phaseTrackerId = ? AND phaseNumber = ? LIMIT 1',
      )
      .get(phaseTrackerId, phaseNumber);

    if (existing?.id) {
      db.prepare(
        'UPDATE "Phase" SET phaseKey = ?, updatedAt = ? WHERE id = ?',
      ).run(phaseKey, now, existing.id);
      continue;
    }

    db.prepare(
      'INSERT INTO "Phase" (id, phaseTrackerId, phaseNumber, phaseKey, status, startedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      randomUUID(),
      phaseTrackerId,
      phaseNumber,
      phaseKey,
      phaseNumber === 1 ? "in_progress" : "locked",
      phaseNumber === 1 ? now : null,
      now,
      now,
    );
  }
}

function ensureUserByUsername(db, input) {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(DEFAULT_PASSWORD);
  const existing = db
    .prepare('SELECT id FROM "User" WHERE username = ? LIMIT 1')
    .get(input.username);

  if (existing?.id) {
    db.prepare(
      `UPDATE "User"
       SET email = ?,
           name = ?,
           role = ?,
           organizationId = ?,
           passwordHash = ?,
           passwordVersion = CASE WHEN passwordVersion < 1 THEN 1 ELSE passwordVersion END,
           mustChangePassword = 0,
           isActive = 1,
           failedLoginAttempts = 0,
           lastFailedLoginAt = NULL,
           lockedUntil = NULL,
           updatedAt = ?
       WHERE id = ?`,
    ).run(
      input.email,
      input.name,
      input.role,
      input.organizationId,
      passwordHash,
      now,
      existing.id,
    );
    return "updated";
  }

  db.prepare(
    `INSERT INTO "User" (
      id, email, username, name, role, organizationId, passwordHash, passwordVersion,
      mustChangePassword, isActive, failedLoginAttempts, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 0, ?, ?)`,
  ).run(
    randomUUID(),
    input.email,
    input.username,
    input.name,
    input.role,
    input.organizationId,
    passwordHash,
    now,
    now,
  );
  return "created";
}

function run() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found at ${CSV_PATH}`);
  }

  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const organizations = parseCsv(csv);
  const db = new Database(DB_PATH);

  const provision = db.transaction(() => {
    const accounts = [];

    for (const organization of organizations) {
      const organizationId = ensureOrganization(db, organization);
      const phaseTrackerId = ensurePhaseTracker(db, organizationId);
      ensurePhases(db, phaseTrackerId);

      const base = slugify(organization.name) || `org-${organizationId.slice(0, 8)}`;
      const username = `${base}-admin`;
      const email = username;

      const status = ensureUserByUsername(db, {
        username,
        email,
        name: `${organization.name} Admin`,
        role: "ngo_admin",
        organizationId,
      });

      accounts.push({
        organization: organization.name,
        country: organization.country,
        username,
        password: DEFAULT_PASSWORD,
        status,
      });
    }

    return accounts;
  });

  const accounts = provision();
  console.log(
    JSON.stringify(
      {
        organizationsProvisioned: accounts.length,
        defaultPassword: DEFAULT_PASSWORD,
        accounts,
      },
      null,
      2,
    ),
  );
}

run();
