import Link from "next/link";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { OrganizationContextSwitcher } from "@/components/OrganizationContextSwitcher";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  dedupeOrganizationContextOptions,
  getRoleSidebarPrimaryNavKey,
  getRoleSidebarSystemNavKeys,
} from "@/lib/role-navigation";
import { getRoleDashboardPath, getRoleViewContract } from "@/lib/role-dashboard-contracts";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/components/logout-actions";
import {
  DashboardIcon,
  RocketIcon,
  SearchIcon,
  FrameworkIcon,
  EditIcon,
  CheckCircleIcon,
  FileIcon,
  UsersIcon,
  BookIcon,
  SettingsIcon,
  LockIcon,
  LogOutIcon,
} from "@/components/icons";

interface SidebarProps {
  lang: Locale;
  activePath?: string;
}

export default async function Sidebar({ lang, activePath }: SidebarProps) {
  const [dict, session] = await Promise.all([getDictionary(lang), getSession()]);
  const canSwitchContext =
    session.role === "facilitator" || session.role === "focus_coordinator";
  const roleContract = getRoleViewContract(session.role);
  const organizations = canSwitchContext
    ? dedupeOrganizationContextOptions(
        await prisma.organization.findMany({
          where: {
            users: {
              some: {
                role: "ngo_admin",
                isActive: true,
              },
            },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        }),
        session.organizationId ?? null,
      )
    : [];
  const selectedOrganizationId =
    session.organizationId && organizations.some((organization) => organization.id === session.organizationId)
      ? session.organizationId
      : organizations[0]?.id ?? null;
  const phaseWorkspacesEnabled = isFeatureEnabled("phaseWorkspaces");
  const deliverablesEnabled = isFeatureEnabled("deliverablesLifecycle");
  const roleLabel =
    roleContract.workspaceIntent === "organizations"
      ? dict.landing.role_entries.organizations
      : roleContract.workspaceIntent === "facilitator"
        ? dict.landing.role_entries.facilitator
        : dict.landing.role_entries.officials;

  const primaryNavKey = getRoleSidebarPrimaryNavKey(session.role);
  const navItems =
    primaryNavKey === "cohort"
      ? [{ href: `/${lang}/cohort`, label: dict.nav.cohort, icon: <UsersIcon /> }]
      : [{ href: `/${lang}/dashboard`, label: dict.nav.dashboard, icon: <DashboardIcon /> }];

  const phaseItems = phaseWorkspacesEnabled
    ? [
        { href: `/${lang}/phases/1`, label: dict.nav.phase1, icon: <RocketIcon /> },
        { href: `/${lang}/phases/2`, label: dict.nav.phase2, icon: <SearchIcon /> },
        { href: `/${lang}/phases/3`, label: dict.nav.phase3, icon: <FrameworkIcon /> },
        { href: `/${lang}/phases/4`, label: dict.nav.phase4, icon: <EditIcon /> },
        { href: `/${lang}/phases/5`, label: dict.nav.phase5, icon: <CheckCircleIcon /> },
        { href: `/${lang}/phases/6`, label: dict.nav.phase6, icon: <FileIcon /> },
      ]
    : [];

  const systemNavKeys = getRoleSidebarSystemNavKeys({
    role: session.role,
    deliverablesEnabled,
  });
  const systemItems = systemNavKeys.map((key) => {
    if (key === "deliverables") {
      return { href: `/${lang}/deliverables`, label: dict.nav.deliverables, icon: <FileIcon /> };
    }
    if (key === "pending_approvals") {
      return {
        href: `/${lang}/dashboard?queue=pending`,
        label: lang === "es" ? "Aprobaciones pendientes" : "Pending approvals",
        icon: <CheckCircleIcon />,
      };
    }
    if (key === "cohort") {
      return { href: `/${lang}/cohort`, label: dict.nav.cohort, icon: <UsersIcon /> };
    }
    return { href: `/${lang}/examples`, label: dict.nav.examples, icon: <BookIcon /> };
  });

  return (
    <aside className="sidebar" role="navigation" aria-label={lang === "es" ? "Navegacion lateral" : "Side navigation"}>
      <div className="sidebar-brand">
        {dict.app.title}
        <div className="sidebar-role-context">{roleLabel}</div>
      </div>

      {canSwitchContext ? (
        <OrganizationContextSwitcher
          label={lang === "es" ? "Contexto organizacion" : "Organization context"}
          organizations={organizations}
          selectedOrganizationId={selectedOrganizationId}
          disabled={session.authMode !== "credentials"}
        />
      ) : null}

      <form action={logoutAction} className="sidebar-account-actions">
        <input type="hidden" name="lang" value={lang} />
        <button type="submit" className="sidebar-link sidebar-link-button">
          <LogOutIcon />
          {lang === "es" ? "Cerrar sesion" : "Sign out"}
        </button>
      </form>

      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`sidebar-link${activePath === item.href ? " active" : ""}`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}

      {phaseItems.length > 0 ? (
        <>
          <div className="sidebar-section-label">
            {lang === "es" ? "Fases" : "Phases"}
          </div>
          {phaseItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${activePath === item.href ? " active" : ""}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </>
      ) : (
        <>
          <div className="sidebar-section-label">
            {lang === "es" ? "Fases" : "Phases"}
          </div>
          <div className="sidebar-link" aria-disabled>
            <LockIcon />
            {lang === "es" ? "Flujo de fases deshabilitado" : "Phase flow disabled"}
          </div>
        </>
      )}

      <div className="sidebar-section-label">
        {lang === "es" ? "Sistema" : "System"}
      </div>
      {systemItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`sidebar-link${activePath === item.href ? " active" : ""}`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}

      <div style={{ flex: 1 }} />

      <Link
        href={getRoleDashboardPath(session.role, lang === "es" ? "en" : "es")}
        className="sidebar-link"
        aria-label={lang === "es" ? "Switch to English" : "Cambiar a espanol"}
      >
        <SettingsIcon />
        {lang === "es" ? "EN" : "ES"}
      </Link>
    </aside>
  );
}
