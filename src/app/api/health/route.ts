import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function checkDatabase() {
  await prisma.$queryRawUnsafe("SELECT 1");
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await checkDatabase();

    return NextResponse.json(
      {
        status: "ok",
        checkedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        checks: {
          database: "ok",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        checkedAt,
        checks: {
          database: "error",
        },
        error: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 503 },
    );
  }
}
