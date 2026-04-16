import path from "node:path";
import { mkdirSync } from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveSqliteDatabasePath(): string {
  const configuredUrl = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";
  if (!configuredUrl.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must use sqlite file syntax (e.g. file:./data/prod.db).",
    );
  }

  let filePath = configuredUrl.slice("file:".length);
  if (!filePath) {
    throw new Error("DATABASE_URL file path is empty.");
  }

  if (filePath.startsWith("//")) {
    try {
      filePath = new URL(configuredUrl).pathname;
    } catch {
      // Keep the original file path if URL parsing fails.
    }
  }

  if (/^\/[A-Za-z]:\//.test(filePath)) {
    filePath = filePath.slice(1);
  }

  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath);
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

const sqliteAdapter = new PrismaBetterSqlite3({
  url: resolveSqliteDatabasePath(),
});

function hasRequiredDelegates(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) {
    return false;
  }

  const candidate = client as PrismaClient & {
    organization?: unknown;
    facilitatorGuidance?: unknown;
    facilitatorGuidanceTask?: unknown;
    platformSetting?: unknown;
  };
  return (
    typeof candidate.organization !== "undefined" &&
    typeof candidate.facilitatorGuidance !== "undefined" &&
    typeof candidate.facilitatorGuidanceTask !== "undefined" &&
    typeof candidate.platformSetting !== "undefined"
  );
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: sqliteAdapter,
  });
}

const sharedClient = hasRequiredDelegates(globalForPrisma.prisma)
  ? globalForPrisma.prisma
  : undefined;

export const prisma = sharedClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
