import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { readInvitesAsync, writeInvitesAsync } from "@/lib/csv";
import { requireRole } from "@/lib/auth";
import type { Invite, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_ROLES: Role[] = ["admin", "editor"];
const INVITE_TTL_DAYS = 7;

export async function GET() {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;
  const invites = await readInvitesAsync();
  return NextResponse.json([...invites].reverse());
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { role, label } = await request.json();
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Role must be admin or editor" }, { status: 400 });
  }

  const invite: Invite = {
    id: randomBytes(24).toString("hex"), // 192-bit token — the link IS the credential
    role,
    label: (label || "").trim(),
    createdBy: auth.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    usedAt: "",
    usedBy: "",
  };

  const invites = await readInvitesAsync();
  invites.push(invite);
  await writeInvitesAsync(invites);
  return NextResponse.json(invite, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const invites = await readInvitesAsync();
  await writeInvitesAsync(invites.filter((i) => i.id !== id));
  return NextResponse.json({ success: true });
}
