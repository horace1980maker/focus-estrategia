import ActiveSidebar from "@/components/sidebar";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

interface LegacySidebarProps {
  lang: Locale;
  dict: Dictionary;
  currentPhase: number;
  activePath?: string;
}

function mapLegacyActivePath(lang: Locale, activePath?: string): string | undefined {
  if (!activePath) {
    return undefined;
  }

  if (activePath.startsWith(`/${lang}/`)) {
    return activePath;
  }

  if (activePath === "dashboard") {
    return `/${lang}/dashboard`;
  }

  if (activePath.startsWith("phase-")) {
    const phaseNumber = activePath.replace("phase-", "");
    return `/${lang}/phases/${phaseNumber}`;
  }

  if (activePath === "deliverables") {
    return `/${lang}/deliverables`;
  }

  if (activePath === "cohort") {
    return `/${lang}/cohort`;
  }

  if (activePath === "library") {
    return `/${lang}/examples`;
  }

  return undefined;
}

/**
 * Compatibility wrapper to avoid duplicated sidebar implementations.
 * Keeps legacy import path/API stable while delegating rendering to the active sidebar.
 */
export default async function Sidebar({ lang, activePath }: LegacySidebarProps) {
  return <ActiveSidebar lang={lang} activePath={mapLegacyActivePath(lang, activePath)} />;
}
