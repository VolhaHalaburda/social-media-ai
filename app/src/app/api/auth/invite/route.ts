import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { readInvitesAsync, writeInvitesAsync, readUsersAsync, writeUsersAsync } from "@/lib/csv";
import { hashPassword } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import type { Invite, User } from "@/lib/types";

export const dynamic = "force-dynamic";

// Public endpoint (the invite token is the credential). GET validates a token
// for the invite page; POST redeems it — creates the account, marks the invite
// used, and signs the new user in.

function inviteStatus(invite: Invite | undefined): { ok: boolean; error?: string } {
  if (!invite) return { ok: false, error: "This invite link is not valid." };
  if (invite.usedAt) return { ok: false, error: "This invite has already been used." };
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: "This invite has expired — ask for a new link." };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "";
  const invite = (await readInvitesAsync()).find((i) => i.id === token);
  const status = inviteStatus(invite);
  if (!status.ok) return NextResponse.json({ valid: false, error: status.error });
  return NextResponse.json({ valid: true, role: invite!.role });
}

export async function POST(request: Request) {
  const { token, name, email, password } = await request.json();

  const invites = await readInvitesAsync();
  const invite = invites.find((i) => i.id === token);
  const status = inviteStatus(invite);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 403 });

  if (!name?.trim() || !email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Name, a valid email, and a password of at least 8 characters are required" },
      { status: 400 }
    );
  }

  const users = await readUsersAsync();
  const normalized = String(email).trim().toLowerCase();
  if (users.some((u) => u.email === normalized)) {
    return NextResponse.json({ error: "An account with this email already exists — sign in instead" }, { status: 409 });
  }

  const user: User = {
    id: uuid(),
    email: normalized,
    name: name.trim(),
    role: invite!.role,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsersAsync(users);

  invite!.usedAt = new Date().toISOString();
  invite!.usedBy = normalized;
  await writeInvitesAsync(invites);

  const session = await signSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  const res = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
