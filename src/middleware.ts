import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * UX guard only: sends visitors without a session cookie to /login.
 * It does NOT verify the signature (middleware runs on the Edge runtime);
 * real verification happens server-side in getCurrentUser()/requireUser().
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect pages; skip login, API routes (they return 401 themselves) and static assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
