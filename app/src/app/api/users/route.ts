import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { readUsersAsync, writeUsersAsync } from "@/lib/csv";
import { hashPassword, requireRole } from "@/lib/auth";
import type { Role, User } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_ROLES: Role[] = ["admin", "editor"];

function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

export async function GET() {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;
  const users = await readUsersAsync();
  return NextResponse.json(users.map(publicUser));
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { name, email, password, role } = await request.json();
  if (!name?.trim() || !email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Name, a valid email, and a password of at least 8 characters are required" },
      { status: 400 }
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Role must be admin or editor" }, { status: 400 });
  }

  const users = await readUsersAsync();
  const normalized = String(email).trim().toLowerCase();
  if (users.some((u) => u.email === normalized)) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const user: User = {
    id: uuid(),
    email: normalized,
    name: name.trim(),
    role,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsersAsync(users);
  return NextResponse.json(publicUser(user), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { id, role, password } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const users = await readUsersAsync();
  const user = users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Role must be admin or editor" }, { status: 400 });
    }
    // Never allow demoting the last admin — that would lock everyone out of
    // user management permanently.
    const admins = users.filter((u) => u.role === "admin");
    if (user.role === "admin" && role !== "admin" && admins.length === 1) {
      return NextResponse.json({ error: "Cannot demote the only admin" }, { status: 400 });
    }
    user.role = role;
  }

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    user.passwordHash = hashPassword(password);
  }

  await writeUsersAsync(users);
  return NextResponse.json(publicUser(user));
}

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === auth.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const users = await readUsersAsync();
  const user = users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeUsersAsync(users.filter((u) => u.id !== id));
  return NextResponse.json({ success: true });
}
