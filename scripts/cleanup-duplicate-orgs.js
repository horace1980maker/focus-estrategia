const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const Database = require("better-sqlite3");

function resolveSqliteDbPath() {
  const configuredUrl = process.env.DATABASE_URL?.trim();
  if (!configuredUrl) {
    return path.resolve(__dirname, "..", "prisma", "dev.db");
  }

  if (!configuredUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use sqlite file syntax (for example file:./data/prod.db).");
  }

  let filePath = configuredUrl.slice("file:".length);
  if (!filePath) {
    throw new Error("DATABASE_URL file path is empty.");
  }

  if (filePath.startsWith("//")) {
    try {
      filePath = new URL(configuredUrl).pathname;
    } catch {
      // Keep original path if URL parsing fails.
    }
  }

  if (/^\/[A-Za-z]:\//.test(filePath)) {
    filePath = filePath.slice(1);
  }

  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(process.cwd(), filePath);
  }

  return filePath;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseDateSafe(input) {
  if (!input) {
    return 0;
  }
  const ms = new Date(input).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getOrgScore(db, organizationId) {
  const count = (sql) => db.prepare(sql).get(organizationId).c;

  const users = count('SELECT COUNT(*) AS c FROM "User" WHERE organizationId = ?');
  const sessions = count('SELECT COUNT(*) AS c FROM "ActivitySession" WHERE organizationId = ?');
  const engagement = count('SELECT COUNT(*) AS c FROM "SectionEngagement" WHERE organizationId = ?');
  const deliverables = count('SELECT COUNT(*) AS c FROM "Deliverable" WHERE organizationId = ?');
  const drafts =
    count('SELECT COUNT(*) AS c FROM "DraftObjectiveResult" WHERE organizationId = ?') +
    count('SELECT COUNT(*) AS c FROM "DraftLineOfAction" WHERE organizationId = ?') +
    count('SELECT COUNT(*) AS c FROM "DraftAssumptionRisk" WHERE organizationId = ?') +
    count('SELECT COUNT(*) AS c FROM "DraftSnapshot" WHERE organizationId = ?');
  const diagnostics =
    count('SELECT COUNT(*) AS c FROM "DiagnosisSurveyResponse" WHERE organizationId = ?') +
    count('SELECT COUNT(*) AS c FROM "DiagnosticFinding" WHERE organizationId = ?');
  const strategic =
    count('SELECT COUNT(*) AS c FROM "StrategicObjective" WHERE organizationId = ?') +
    count('SELECT COUNT(*) AS c FROM "TheoryOfChange" WHERE organizationId = ?');

  const total = users + sessions + engagement + deliverables + drafts + diagnostics + strategic;
  return {
    total,
    users,
    sessions,
    engagement,
    deliverables,
    drafts,
    diagnostics,
    strategic,
  };
}

function pickCanonical(records, scoreMap) {
  const sorted = [...records].sort((left, right) => {
    const leftScore = scoreMap.get(left.id)?.total ?? 0;
    const rightScore = scoreMap.get(right.id)?.total ?? 0;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const leftHardening = left.id.startsWith("org-hardening-");
    const rightHardening = right.id.startsWith("org-hardening-");
    if (leftHardening !== rightHardening) {
      return rightHardening ? 1 : -1;
    }

    const leftUpdated = parseDateSafe(left.updatedAt);
    const rightUpdated = parseDateSafe(right.updatedAt);
    if (rightUpdated !== leftUpdated) {
      return rightUpdated - leftUpdated;
    }

    const leftCreated = parseDateSafe(left.createdAt);
    const rightCreated = parseDateSafe(right.createdAt);
    if (leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }

    return left.id.localeCompare(right.id);
  });

  return sorted[0];
}

function findDuplicateGroups(db) {
  const organizations = db
    .prepare('SELECT id, name, createdAt, updatedAt FROM "Organization" ORDER BY name ASC')
    .all();

  const grouped = new Map();
  for (const org of organizations) {
    const key = normalizeName(org.name);
    const list = grouped.get(key) ?? [];
    list.push(org);
    grouped.set(key, list);
  }

  const duplicates = [];
  for (const [normalizedName, rows] of grouped.entries()) {
    if (rows.length > 1) {
      duplicates.push({ normalizedName, rows });
    }
  }

  return duplicates;
}

function backupSqliteFiles(dbPath) {
  const backupDir = path.resolve(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupBase = path.join(backupDir, `dev-before-dedupe-orgs-${stamp}`);

  const copies = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${dbPath}${suffix}`;
    if (!fs.existsSync(src)) {
      continue;
    }
    const dest = `${backupBase}${path.basename(dbPath).endsWith(".db") ? suffix : `.db${suffix}`}`;
    fs.copyFileSync(src, dest);
    copies.push(dest);
  }

  if (copies.length === 0) {
    throw new Error(`No SQLite files found to back up at ${dbPath}`);
  }

  return copies;
}

function purgeOrganization(db, organizationId) {
  const tracker = db
    .prepare('SELECT id FROM "PhaseTracker" WHERE organizationId = ? LIMIT 1')
    .get(organizationId);
  const userIds = db
    .prepare('SELECT id FROM "User" WHERE organizationId = ?')
    .all(organizationId)
    .map((row) => row.id);
  const responseIds = db
    .prepare('SELECT id FROM "DiagnosisSurveyResponse" WHERE organizationId = ?')
    .all(organizationId)
    .map((row) => row.id);
  const theoryIds = db
    .prepare('SELECT id FROM "TheoryOfChange" WHERE organizationId = ?')
    .all(organizationId)
    .map((row) => row.id);

  const inPlaceholders = (values) => values.map(() => "?").join(", ");

  db.prepare('DELETE FROM "ValidationSignoff" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "ValidationFeedbackResponse" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "DraftSnapshot" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "DraftAssumptionRisk" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "DraftLineOfAction" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "DraftObjectiveResult" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "Deliverable" WHERE organizationId = ?').run(organizationId);

  if (responseIds.length > 0) {
    db.prepare(
      `DELETE FROM "DiagnosisSurveyAnswer" WHERE responseId IN (${inPlaceholders(responseIds)})`,
    ).run(...responseIds);
  }
  db.prepare('DELETE FROM "DiagnosisSurveyResponse" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "DiagnosticFinding" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "StrategicObjective" WHERE organizationId = ?').run(organizationId);

  if (theoryIds.length > 0) {
    db.prepare(`DELETE FROM "Outcome" WHERE theoryOfChangeId IN (${inPlaceholders(theoryIds)})`).run(
      ...theoryIds,
    );
    db.prepare(`DELETE FROM "Pathway" WHERE theoryOfChangeId IN (${inPlaceholders(theoryIds)})`).run(
      ...theoryIds,
    );
  }
  db.prepare('DELETE FROM "TheoryOfChange" WHERE organizationId = ?').run(organizationId);

  db.prepare('DELETE FROM "PhaseMigrationAudit" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "ActivitySession" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "SectionEngagement" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "RoiSnapshot" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "RoiBenchmarkChange" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "RoiSetting" WHERE organizationId = ?').run(organizationId);

  if (tracker?.id) {
    const phaseIds = db
      .prepare('SELECT id FROM "Phase" WHERE phaseTrackerId = ?')
      .all(tracker.id)
      .map((row) => row.id);
    if (phaseIds.length > 0) {
      db.prepare(
        `DELETE FROM "PhaseOutputCompletion" WHERE phaseId IN (${inPlaceholders(phaseIds)})`,
      ).run(...phaseIds);
      db.prepare(`DELETE FROM "PhaseReview" WHERE phaseId IN (${inPlaceholders(phaseIds)})`).run(
        ...phaseIds,
      );
    }
    db.prepare('DELETE FROM "Phase" WHERE phaseTrackerId = ?').run(tracker.id);
    db.prepare('DELETE FROM "PhaseTracker" WHERE id = ?').run(tracker.id);
  }

  db.prepare('DELETE FROM "AuthSession" WHERE organizationContextId = ?').run(organizationId);
  if (userIds.length > 0) {
    db.prepare(`DELETE FROM "AuthSession" WHERE userId IN (${inPlaceholders(userIds)})`).run(
      ...userIds,
    );
    db.prepare(`UPDATE "User" SET provisionedById = NULL WHERE provisionedById IN (${inPlaceholders(userIds)})`).run(
      ...userIds,
    );
  }

  db.prepare('DELETE FROM "User" WHERE organizationId = ?').run(organizationId);
  db.prepare('DELETE FROM "Organization" WHERE id = ?').run(organizationId);
}

function run() {
  const apply = process.argv.includes("--apply");
  const dbPath = resolveSqliteDbPath();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const duplicateGroups = findDuplicateGroups(db);
  if (duplicateGroups.length === 0) {
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          databasePath: dbPath,
          duplicatesFound: 0,
          message: "No duplicate organization names found.",
        },
        null,
        2,
      ),
    );
    db.close();
    return;
  }

  const plan = duplicateGroups.map((group) => {
    const scoreMap = new Map(
      group.rows.map((row) => [row.id, getOrgScore(db, row.id)]),
    );
    const keep = pickCanonical(group.rows, scoreMap);
    const remove = group.rows.filter((row) => row.id !== keep.id);
    return {
      normalizedName: group.normalizedName,
      displayName: keep.name.trim(),
      keep: {
        id: keep.id,
        createdAt: keep.createdAt,
        updatedAt: keep.updatedAt,
        score: scoreMap.get(keep.id),
      },
      remove: remove.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        score: scoreMap.get(row.id),
      })),
    };
  });

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          databasePath: dbPath,
          duplicatesFound: duplicateGroups.length,
          organizationsToDelete: plan.reduce((acc, item) => acc + item.remove.length, 0),
          plan,
          usage: 'Run again with "--apply" to execute cleanup.',
        },
        null,
        2,
      ),
    );
    db.close();
    return;
  }

  const backups = backupSqliteFiles(dbPath);
  db.pragma("foreign_keys = OFF");
  try {
    const execute = db.transaction(() => {
      for (const item of plan) {
        for (const victim of item.remove) {
          purgeOrganization(db, victim.id);
        }
      }
    });
    execute();
  } finally {
    db.pragma("foreign_keys = ON");
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        databasePath: dbPath,
        backups,
        notes: [
          "AuditEvent rows are immutable and were intentionally preserved.",
          "Cleanup ran with temporary foreign key checks disabled to allow one-time local dedupe.",
        ],
        duplicatesFound: duplicateGroups.length,
        organizationsDeleted: plan.reduce((acc, item) => acc + item.remove.length, 0),
        keptOrganizations: plan.map((item) => ({
          normalizedName: item.normalizedName,
          keptId: item.keep.id,
          deletedIds: item.remove.map((row) => row.id),
        })),
      },
      null,
      2,
    ),
  );
  db.close();
}

try {
  run();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
