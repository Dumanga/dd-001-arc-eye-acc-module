import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adminPrefix = "/admin";
const authLoginPath = "/auth/login";
const authLogoutPath = "/auth/logout";
const legacyReportsPath = "/operation/admin/settings";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === authLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/operation/login";
    return NextResponse.redirect(url);
  }

  if (pathname === authLogoutPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/operation/logout";
    return NextResponse.redirect(url);
  }

  if (pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(adminPrefix, "/operation/admin");
    return NextResponse.redirect(url);
  }

  if (pathname === legacyReportsPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/operation/admin/reports";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/auth/login",
    "/auth/logout",
    "/operation/admin/settings",
  ],
};
