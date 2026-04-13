import { redirect } from "next/navigation";
import { buildLoginRedirectPath } from "@/lib/auth-routing";
import { getRoleDashboardPath } from "@/lib/role-dashboard-contracts";
import { getSessionOrNull } from "@/lib/session";

export default async function OrganizationsWorkspaceEntry({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const session = await getSessionOrNull();
  if (!session) {
    redirect(
      buildLoginRedirectPath({
        locale: lang === "en" ? "en" : "es",
        nextPath: `/${lang}/workspace/organizations`,
      }),
    );
  }
  redirect(getRoleDashboardPath(session.role, lang === "en" ? "en" : "es"));
}
