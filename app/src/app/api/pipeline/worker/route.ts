import { NextResponse, after } from "next/server";
import { advanceJob } from "@/lib/jobs";
import { baseUrlFromRequest } from "@/lib/request-url";
import { INTERNAL_TOKEN_HEADER, verifyInternalToken } from "@/lib/session";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Processes exactly one video for a job, then chains to the next step. Returns
// 202 immediately and does the (multi-second) analysis work in `after()`, so
// the invocation that triggered this one isn't blocked waiting on it.
//
// This route is exempt from cookie auth in the proxy (it's called by the server
// itself, which has no user session) — instead it requires the internal machine
// token derived from AUTH_SECRET.
export async function POST(req: Request) {
  if (!(await verifyInternalToken(req.headers.get(INTERNAL_TOKEN_HEADER)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = (await req.json()) as { jobId: string };
  const base = baseUrlFromRequest(req);

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  after(() => advanceJob(jobId, base));

  return NextResponse.json({ accepted: true }, { status: 202 });
}
