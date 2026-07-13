import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readUsersAsync } from "./csv";
import { SESSION_COOKIE, verifySession } from "./session";
import type { Role, SessionUser } from "./types";

// ---------------------------------------------------------------------------
// Node-only auth helpers: password hashing (scrypt) and per-request guards for
// route handlers. Edge-safe token logic lives in session.ts.
// ---------------------------------------------------------------------------

// ---- Passwords ----------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

// ---- Login throttling (in-memory, per instance) --------------------------------

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function loginThrottled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}

// ---- Request guards -------------------------------------------------------------

// The proxy already rejects unauthenticated requests cheaply (signature check
// only). These guards re-verify AND look the user up in storage, so deleted
// users and role downgrades take effect immediately for sensitive routes.
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const user = (await readUsersAsync()).find((u) => u.id === session.id);
  if (!user) {
    return NextResponse.json({ error: "Account no longer exists" }, { status: 401 });
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requireRole(role: Role): Promise<SessionUser | NextResponse> {
  const result = await requireUser();
  if (result instanceof NextResponse) return result;
  if (role === "admin" && result.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return result;
}
