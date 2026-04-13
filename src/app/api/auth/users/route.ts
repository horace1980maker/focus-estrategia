import { NextRequest, NextResponse } from "next/server";
import { ROLES, type Role } from "@/lib/auth";
import { AuthServiceError, provisionUserAccount } from "@/lib/auth-service";
import { getSession } from "@/lib/session";

type ProvisionUserPayload = {
  username?: string | null;
  name?: string;
  role?: string;
  organizationId?: string | null;
  password?: string;
  mustChangePassword?: boolean;
};

const ALLOWED_ROLES = new Set<Role>([
  ROLES.NGO_ADMIN,
  ROLES.FACILITATOR,
  ROLES.FOCUS_COORDINATOR,
]);

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
} as const;

function isPasswordPolicyValid(password: string): boolean {
  if (password.length < 8) {
    return false;
  }
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  return hasUppercase && hasLowercase && hasDigit;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as ProvisionUserPayload;

    const username = body.username?.trim();
    const name = body.name?.trim();
    const role = body.role as Role | undefined;
    const password = body.password ?? "";
    const organizationId = body.organizationId?.trim() ?? null;

    if (!username || !name || !role || password.length === 0) {
      return NextResponse.json(
        { error: "username, name, role, and password are required." },
        { status: 400 },
      );
    }

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        { error: "role is invalid." },
        { status: 400 },
      );
    }

    if (!isPasswordPolicyValid(password)) {
      return NextResponse.json(
        {
          error:
            "password must be at least 8 characters and include uppercase, lowercase, and numeric characters.",
        },
        { status: 400 },
      );
    }

    if (role === ROLES.NGO_ADMIN && !organizationId) {
      return NextResponse.json(
        { error: "organizationId is required when role is ngo_admin." },
        { status: 400 },
      );
    }

    if ((role === ROLES.FACILITATOR || role === ROLES.FOCUS_COORDINATOR) && organizationId) {
      return NextResponse.json(
        { error: "organizationId must be null when role is facilitator or focus_coordinator." },
        { status: 400 },
      );
    }

    const user = await provisionUserAccount({
      actor: session,
      username,
      name,
      role,
      organizationId,
      password,
      mustChangePassword: body.mustChangePassword ?? true,
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          mustChangePassword: user.mustChangePassword,
        },
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "User provisioning failed." },
      { status: 500 },
    );
  }
}
