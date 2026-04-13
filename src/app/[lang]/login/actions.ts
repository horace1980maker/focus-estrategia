"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AuthServiceError,
  SESSION_COOKIE_NAME,
  authenticateWithCredentials,
} from "@/lib/auth-service";
import { resolvePostLoginRedirectPath } from "@/lib/auth-routing";
import type { Role } from "@/lib/auth";

type LoginState = {
  error: string | null;
};

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const lang = String(formData.get("lang") ?? "es").toLowerCase() === "en" ? "en" : "es";
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "").trim();

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  let authenticatedRole: Role | null = null;

  try {
    const result = await authenticateWithCredentials({
      username,
      password,
    });
    authenticatedRole = result.user.role as Role;

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.authSession.expiresAt,
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return { error: error.message };
    }
    return {
      error: error instanceof Error ? error.message : "Login failed.",
    };
  }

  const destination = resolvePostLoginRedirectPath({
    locale: lang,
    role: authenticatedRole ?? "ngo_admin",
    requestedNext,
  });
  redirect(destination);
}
