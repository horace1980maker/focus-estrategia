"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeAuthSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-service";

export async function logoutAction(formData: FormData) {
  const lang = String(formData.get("lang") ?? "es").toLowerCase() === "en" ? "en" : "es";
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

  redirect(`/${lang}/login`);
}
