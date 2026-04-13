import type { Locale } from "@/i18n/config";
import type { Role } from "@/lib/auth";
import { getRoleDashboardPath } from "@/lib/role-dashboard-contracts";

function normalizePathWithLocale(path: string, locale: Locale): string | null {
  if (!path.startsWith(`/${locale}/`)) {
    return null;
  }
  if (path === `/${locale}/login` || path === `/${locale}/forbidden`) {
    return null;
  }
  return path;
}

export function buildPathWithQuery(
  pathname: string,
  query?: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value.length > 0) {
        params.set(key, value);
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && entry.length > 0) {
            params.append(key, entry);
          }
        }
      }
    }
  }
  const search = params.toString();
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

export function buildLoginRedirectPath(input: {
  locale: Locale;
  nextPath: string;
}) {
  const next = encodeURIComponent(input.nextPath);
  return `/${input.locale}/login?next=${next}`;
}

export function resolvePostLoginRedirectPath(input: {
  locale: Locale;
  role: Role;
  requestedNext: string | null;
}) {
  const safeNext = input.requestedNext
    ? normalizePathWithLocale(input.requestedNext, input.locale)
    : null;
  return safeNext ?? getRoleDashboardPath(input.role, input.locale);
}
