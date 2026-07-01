import { NextResponse, after } from "next/server";
import { advanceJob } from "@/lib/jobs";
import { baseUrlFromRequest } from "@/lib/request-url";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Processes exactly one video for a job, then chains to the next step. Returns
// 202 immediately and does the (multi-second) analysis work in `after()`, so
// the invocation that triggered this one isn't blocked waiting on it.
export async function POST(req: Request) {
  const { jobId } = (await req.json()) as { jobId: string };
  const base = baseUrlFromRequest(req);

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  after(() => advanceJob(jobId, base));

  return NextResponse.json({ accepted: true }, { status: 202 });
}
