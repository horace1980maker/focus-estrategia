import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeAuthSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-service";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
} as const;

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

  return NextResponse.json(
    { ok: true },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}
