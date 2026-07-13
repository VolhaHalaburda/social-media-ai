import { NextResponse, after } from "next/server";
import { initJob, runScrapePhase } from "@/lib/jobs";
import { baseUrlFromRequest } from "@/lib/request-url";
import { requireRole } from "@/lib/auth";
import type { PipelineParams } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Kicks off a pipeline run and returns a jobId immediately. The scrape phase
// (and everything after) runs in the background via `after()`, so the client
// gets an id to poll right away instead of holding a long request open.
// Admin-only: a run costs real API money (Apify + Gemini + Claude).
export async function POST(req: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const params = (await req.json()) as PipelineParams;
  const base = baseUrlFromRequest(req);

  const job = await initJob(params, auth.email);
  after(() => runScrapePhase(job, base));

  return NextResponse.json({ jobId: job.id });
}
