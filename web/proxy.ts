import { NextResponse, type NextRequest } from "next/server";
import { notSignedIn, requestSession } from "@/lib/session";

/** The only paths open to visitors who aren't signed in. */
const PUBLIC_PATHS = new Set(["/sign-in", "/api/auth/sign-in"]);

/**
 * Closes the app to strangers: server routes answer 401, pages redirect to sign-in.
 * It also keeps the session cookies fresh. Route handlers check the User again themselves.
 */
export async function proxy(request: NextRequest) {
  const session = await requestSession(request);
  const { pathname } = request.nextUrl;

  if (!session.user && !PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/api" || pathname.startsWith("/api/")) return session.respond(notSignedIn());
    return session.respond(NextResponse.redirect(new URL("/sign-in", request.url)));
  }
  if (session.user && pathname === "/sign-in") {
    return session.respond(NextResponse.redirect(new URL("/", request.url)));
  }
  return session.respond(NextResponse.next({ request }));
}

export const config = {
  // Everything except Next's own static files and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
