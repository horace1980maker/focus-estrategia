const path = require("node:path");
const { randomBytes, scryptSync, randomUUID } = require("node:crypto");
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

const DB_PATH = resolveSqliteDbPath();
const DEFAULT_PASSWORD = process.env.BOOTSTRAP_LOGIN_PASSWORD ?? "DemoPass2026!";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `v1:${salt}:${hash}`;
}

function getFirstOrganizationId(db) {
  const org = db
    .prepare('SELECT id, name FROM "Organization" ORDER BY createdAt ASC LIMIT 1')
    .get();
  return org?.id ?? null;
}

function findUserByRole(db, role) {
  return db
    .prepare('SELECT id, email, role, organizationId FROM "User" WHERE role = ? ORDER BY createdAt ASC LIMIT 1')
    .get(role);
}

function assertUsernameAvailable(db, username, userId) {
  const conflict = db
    .prepare('SELECT id FROM "User" WHERE username = ? LIMIT 1')
    .get(username);
  if (conflict && conflict.id !== userId) {
    throw new Error(`Username "${username}" is already used by another user.`);
  }
}

function upsertLoginUser(db, input) {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(DEFAULT_PASSWORD);
  const existing = findUserByRole(db, input.role);

  if (existing?.id) {
    assertUsernameAvailable(db, input.username, existing.id);
    db.prepare(
      `UPDATE "User"
       SET username = ?,
           name = ?,
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
      input.username,
      input.name,
      input.organizationId,
      passwordHash,
      now,
      existing.id,
    );

    return {
      username: input.username,
      role: input.role,
      organizationId: input.organizationId,
      source: "updated-existing-user",
    };
  }

  assertUsernameAvailable(db, input.username, null);
  db.prepare(
    `INSERT INTO "User" (
      id, email, username, name, role, organizationId, passwordHash, passwordVersion,
      mustChangePassword, isActive, failedLoginAttempts, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 0, ?)`,
  ).run(
    randomUUID(),
    input.email,
    input.username,
    input.name,
    input.role,
    input.organizationId,
    passwordHash,
    now,
  );

  return {
    username: input.username,
    role: input.role,
    organizationId: input.organizationId,
    source: "created-user",
  };
}

function main() {
  const db = new Database(DB_PATH);
  const organizationId = getFirstOrganizationId(db);

  const results = [
    upsertLoginUser(db, {
      role: "facilitator",
      username: "facilitator",
      name: "Facilitator",
      email: "facilitator",
      organizationId: null,
    }),
    upsertLoginUser(db, {
      role: "focus_coordinator",
      username: "focus",
      name: "FOCUS Official",
      email: "focus",
      organizationId: null,
    }),
  ];

  if (organizationId) {
    results.unshift(
      upsertLoginUser(db, {
        role: "ngo_admin",
        username: "ngo-admin",
        name: "NGO Admin",
        email: "ngo-admin",
        organizationId,
      }),
    );
  }

  console.log(JSON.stringify({
    databasePath: DB_PATH,
    password: DEFAULT_PASSWORD,
    organizationFoundForNgoAdmin: Boolean(organizationId),
    ngoAdminOrganizationId: organizationId,
    accounts: results,
  }, null, 2));
}

main();
