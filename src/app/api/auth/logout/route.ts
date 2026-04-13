import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeAuthSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-service";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeAuthSessionToken({
      token,
      reason: "user_requested",
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
