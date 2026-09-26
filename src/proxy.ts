import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic guard only: bounces visitors without a session cookie away from the
 * admin console. Real authorization happens in every admin page, action and route
 * handler (requirePermission*), which validate the session against the database.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !request.cookies.has("sg_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
