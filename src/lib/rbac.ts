// Role-Based Access Control guard for server components and API routes
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { type Role, canAccessRoute, hasPermission, type Permission } from "./auth";

/**
 * Require authentication and optionally a specific role.
 * Redirects to login if unauthenticated, returns 403 page if wrong role.
 */
export async function requireAuth(allowedRoles?: Role[]) {
  const session = await getSession();

  if (!session) {
    redirect("/es/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    redirect("/es/forbidden");
  }

  return session;
}

/**
 * Require a specific permission.
 */
export async function requirePermission(permission: Permission) {
  const session = await getSession();

  if (!session) {
    redirect("/es/login");
  }

  if (!hasPermission(session.role, permission)) {
    redirect("/es/forbidden");
  }

  return session;
}

/**
 * Check route access for the current user. Used in layouts.
 */
export async function guardRoute(pathname: string) {
  const session = await getSession();

  if (!session) {
    redirect("/es/login");
  }

  if (!canAccessRoute(session.role, pathname)) {
    redirect("/es/forbidden");
  }

  return session;
}
