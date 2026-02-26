import { NextResponse, type NextRequest } from "next/server";

const ACCESS_TOKEN_COOKIE = "hs_at";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasAccessToken = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

  if ((pathname.startsWith("/admin") || pathname.startsWith("/my-bookings")) && !hasAccessToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/my-bookings"],
};

