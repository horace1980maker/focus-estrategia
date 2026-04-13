import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/access-guards";
import {
  createOrganizationAsFacilitator,
  OrganizationAdminServiceError,
} from "@/lib/organization-admin-service";
import { getSession } from "@/lib/session";

type CreateOrganizationPayload = {
  name?: string;
  country?: string | null;
  description?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as CreateOrganizationPayload;

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    const organization = await createOrganizationAsFacilitator({
      actor: session,
      name: body.name,
      country: body.country ?? null,
      description: body.description ?? null,
    });

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        country: organization.country,
        description: organization.description,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof OrganizationAdminServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create organization." },
      { status: 500 },
    );
  }
}
