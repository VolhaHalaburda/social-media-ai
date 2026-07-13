import { NextResponse } from "next/server";
import { readRunsAsync } from "@/lib/csv";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Usage log: who ran the pipeline, when, and how much it processed.
export async function GET() {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;
  const runs = await readRunsAsync();
  return NextResponse.json([...runs].reverse()); // newest first
}
