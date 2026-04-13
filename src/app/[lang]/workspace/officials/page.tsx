import { redirect } from "next/navigation";
import { buildLoginRedirectPath } from "@/lib/auth-routing";
import { ROLES } from "@/lib/auth";
import { getRoleDashboardPath } from "@/lib/role-dashboard-contracts";
import { getSessionOrNull } from "@/lib/session";

export default async function OfficialsWorkspaceEntry({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = lang === "en" ? "en" : "es";
  const session = await getSessionOrNull();
  if (!session) {
    redirect(
      buildLoginRedirectPath({
        locale,
        nextPath: `/${lang}/workspace/officials`,
      }),
    );
  }
  if (session.role !== ROLES.FOCUS_COORDINATOR) {
    redirect(getRoleDashboardPath(session.role, locale));
  }
  redirect(getRoleDashboardPath(session.role, locale));
}
