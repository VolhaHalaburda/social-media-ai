import { NextResponse } from "next/server";
import { readUsersAsync } from "@/lib/csv";
import { clearLoginAttempts, loginThrottled, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const normalized = String(email).trim().toLowerCase();
  if (loginThrottled(normalized)) {
    return NextResponse.json({ error: "Too many attempts — try again in 15 minutes" }, { status: 429 });
  }

  const user = (await readUsersAsync()).find((u) => u.email === normalized);
  // Same error for unknown email and wrong password, so the form doesn't leak
  // which emails have accounts.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  clearLoginAttempts(normalized);
  const token = await signSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  const res = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
