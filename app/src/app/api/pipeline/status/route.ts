import { NextResponse } from "next/server";
import { getJob, jobToProgress } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// Returns the current progress of a job in the PipelineProgress shape the UI
// already renders. The client polls this until status is completed/error.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json(jobToProgress(job));
}
