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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as ProvisionUserPayload;

    if (!body.username || !body.name || !body.role || !body.password) {
      return NextResponse.json(
        { error: "username, name, role, and password are required." },
        { status: 400 },
      );
    }

    if (!ALLOWED_ROLES.has(body.role as Role)) {
      return NextResponse.json(
        { error: "role is invalid." },
        { status: 400 },
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "password must contain at least 8 characters." },
        { status: 400 },
      );
    }

    const user = await provisionUserAccount({
      actor: session,
      username: body.username,
      name: body.name,
      role: body.role as Role,
      organizationId: body.organizationId ?? null,
      password: body.password,
      mustChangePassword: body.mustChangePassword ?? true,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        mustChangePassword: user.mustChangePassword,
      },
    });
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
