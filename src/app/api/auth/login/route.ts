import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AuthServiceError,
  authenticateWithCredentials,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-service";

type LoginPayload = {
  username?: string;
  password?: string;
};

function getRequestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginPayload;
    const username = body.username?.trim();
    const password = body.password ?? "";

    if (!username || password.length === 0) {
      return NextResponse.json(
        { error: "username and password are required." },
        { status: 400 },
      );
    }

    const result = await authenticateWithCredentials({
      username,
      password,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.authSession.expiresAt,
    });

    return NextResponse.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        username: result.user.username,
        role: result.user.role,
        organizationId: result.user.organizationId,
        mustChangePassword: result.user.mustChangePassword,
      },
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 },
    );
  }
}
