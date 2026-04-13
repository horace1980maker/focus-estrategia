import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl = `file:${path.join(__dirname, "prisma", "dev.db")}`;
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

if (!databaseUrl.startsWith("file:")) {
  throw new Error(
    "DATABASE_URL must use a sqlite file URL (e.g. file:./data/prod.db).",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
