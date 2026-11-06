import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate: bounce visitors without a session cookie away from app pages.
 * Real session validation happens in server components (lib/auth.ts).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("pb_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/p/:path*"],
};
