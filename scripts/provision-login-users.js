const { randomBytes, scryptSync, randomUUID } = require("node:crypto");
const Database = require("better-sqlite3");

const DB_PATH = "prisma/dev.db";
const DEFAULT_PASSWORD = process.env.BOOTSTRAP_LOGIN_PASSWORD ?? "DemoPass2026!";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `v1:${salt}:${hash}`;
}

function requireOrganizationId(db) {
  const org = db
    .prepare('SELECT id, name FROM "Organization" ORDER BY createdAt ASC LIMIT 1')
    .get();
  if (!org?.id) {
    throw new Error("No organizations found. Create at least one organization first.");
  }
  return org.id;
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
  const organizationId = requireOrganizationId(db);

  const results = [
    upsertLoginUser(db, {
      role: "ngo_admin",
      username: "ngo-admin",
      name: "NGO Admin",
      email: "ngo-admin",
      organizationId,
    }),
    upsertLoginUser(db, {
      role: "facilitator",
      username: "facilitator",
      name: "Facilitator",
      email: "facilitator",
      organizationId,
    }),
    upsertLoginUser(db, {
      role: "focus_coordinator",
      username: "focus",
      name: "FOCUS Official",
      email: "focus",
      organizationId: null,
    }),
  ];

  console.log(JSON.stringify({
    password: DEFAULT_PASSWORD,
    accounts: results,
  }, null, 2));
}

main();
