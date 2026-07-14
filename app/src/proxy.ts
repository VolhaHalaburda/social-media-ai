import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// ---------------------------------------------------------------------------
// Auth gate for every page and API route. Verifies the session cookie's
// signature + expiry (cheap, no storage read). Route handlers that mutate data
// re-check against the user store via requireUser/requireRole.
// ---------------------------------------------------------------------------

// Paths reachable without a session:
//  - /login and the auth endpoints that create a session
//  - /api/pipeline/worker: server-to-server chain, validates x-internal-token itself
//  - /invite + /api/auth/invite: invite links carry their own credential (the token)
const PUBLIC_PATHS = new Set([
  "/login",
  "/invite",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/invite",
  "/api/pipeline/worker",
]);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  const res = NextResponse.redirect(loginUrl);
  // Drop any invalid/expired cookie so the client state is clean.
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
