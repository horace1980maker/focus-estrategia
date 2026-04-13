import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { AuthServiceError, changeUserPassword } from "@/lib/auth-service";

type PasswordPayload = {
  currentPassword?: string;
  newPassword?: string;
};

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    const payload = (await request.json()) as PasswordPayload;

    if (!payload.newPassword || payload.newPassword.length < 8) {
      return NextResponse.json(
        { error: "newPassword must contain at least 8 characters." },
        { status: 400 },
      );
    }

    await changeUserPassword({
      session,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password update failed." },
      { status: 500 },
    );
  }
}
