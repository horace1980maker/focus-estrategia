import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale, isValidLocale } from "@/i18n/config";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal Next.js paths and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes("/favicon.ico") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // Check if the pathname already has a valid locale prefix
  const pathnameSegments = pathname.split("/");
  const maybeLocale = pathnameSegments[1];

  if (isValidLocale(maybeLocale)) {
    const localePath = `/${pathnameSegments.slice(2).join("/")}`.replace(/\/+$/, "") || "/";
    const publicLocalePaths = new Set<string>(["/", "/login", "/forbidden"]);
    const protectedPrefixes = ["/dashboard", "/cohort", "/phases", "/deliverables", "/examples", "/workspace"];
    const isProtectedPath = protectedPrefixes.some(
      (prefix) => localePath === prefix || localePath.startsWith(`${prefix}/`),
    );

    if (!publicLocalePaths.has(localePath) && isProtectedPath) {
      const allowMockFallback =
        process.env.AUTH_ALLOW_MOCK_FALLBACK === "true" && process.env.NODE_ENV !== "production";
      const hasSessionCookie = request.cookies.has("saw_session");
      if (!hasSessionCookie && !allowMockFallback) {
        const url = request.nextUrl.clone();
        url.pathname = `/${maybeLocale}/login`;
        url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  }

  // No locale found — redirect to default locale (Spanish)
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
