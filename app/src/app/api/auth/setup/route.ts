import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { readUsersAsync, writeUsersAsync } from "@/lib/csv";
import { hashPassword } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

// First-run bootstrap: while the user store is empty, the login page offers a
// "create admin account" form that posts here. As soon as one user exists this
// endpoint locks itself — all further accounts are created by an admin.

export async function GET() {
  const users = await readUsersAsync();
  return NextResponse.json({ needsSetup: users.length === 0 });
}

export async function POST(request: Request) {
  const users = await readUsersAsync();
  if (users.length > 0) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
  }

  const { name, email, password } = await request.json();
  if (!name?.trim() || !email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Name, a valid email, and a password of at least 8 characters are required" },
      { status: 400 }
    );
  }

  const admin: User = {
    id: uuid(),
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role: "admin",
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await writeUsersAsync([admin]);

  const token = await signSession({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
  const res = NextResponse.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
