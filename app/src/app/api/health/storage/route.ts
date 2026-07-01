import { NextResponse } from "next/server";
import { storageHealthCheck } from "@/lib/csv";

// Diagnostic: reports whether this deployment has durable, writable storage.
// Visit /api/health/storage in the browser. `roundTripOk: true` means writes
// persist; false means data is being lost.
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await storageHealthCheck();
  const status = health.roundTripOk ? 200 : 500;
  return NextResponse.json(health, { status });
}
