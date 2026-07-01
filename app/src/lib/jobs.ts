import { v4 as uuid } from "uuid";
import { appendVideoAsync } from "./csv";
import { scrapeAndBuildPending, analyzeVideoToRecord, type ScrapedVideo } from "./pipeline-steps";
import type { ActiveTask, Config, PipelineParams, PipelineProgress } from "./types";

// ---------------------------------------------------------------------------
// Background-job model
//
// A pipeline run is decomposed into many short serverless invocations instead
// of one long-lived request. Job state lives in shared storage (Vercel KV in
// prod; an in-process Map for local dev, which is fine because dev is a single
// process). Each "worker" invocation analyzes exactly ONE video — always well
// inside the function time limit — then triggers the next invocation. The
// client polls a status endpoint. This removes the maxDuration ceiling on how
// many videos a run can process.
// ---------------------------------------------------------------------------

const IS_VERCEL = !!process.env.KV_REST_API_URL;
const JOB_TTL_SECONDS = 60 * 60; // expire finished/abandoned jobs after 1h
const LOG_CAP = 200;

export interface PipelineJob {
  id: string;
  status: "running" | "completed" | "error";
  phase: "scraping" | "analyzing" | "done";
  configName: string;
  params: PipelineParams;
  config: Config | null;
  pending: ScrapedVideo[];
  cursor: number;
  videosTotal: number;
  videosAnalyzed: number;
  creatorsTotal: number;
  activeTask: ActiveTask | null;
  log: string[];
  errors: string[];
  startedAt: string;
  updatedAt: string;
}

// ---- Store ------------------------------------------------------------------

const memJobs = new Map<string, PipelineJob>();

async function putJob(job: PipelineJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  if (IS_VERCEL) {
    const { kv } = await import("@vercel/kv");
    await kv.set(`job:${job.id}`, job, { ex: JOB_TTL_SECONDS });
  } else {
    memJobs.set(job.id, job);
  }
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  if (IS_VERCEL) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<PipelineJob>(`job:${id}`)) ?? null;
  }
  return memJobs.get(id) ?? null;
}

function pushLog(job: PipelineJob, msg: string) {
  job.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (job.log.length > LOG_CAP) job.log.splice(0, job.log.length - LOG_CAP);
}

// Fire off the next worker invocation. Awaited only for the fast 202 ack — the
// receiving invocation does the actual work in its own `after()` callback, so
// this does not block on video processing.
async function triggerWorker(base: string, jobId: string): Promise<void> {
  try {
    await fetch(`${base}/api/pipeline/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
  } catch {
    // If the kickoff fetch fails the job stalls in "running"; the status
    // endpoint surfaces staleness. Nothing else we can safely do from here.
  }
}

// ---- Orchestration ----------------------------------------------------------

// Create the job shell and persist it, so the caller has an id to return to the
// client immediately. Scraping (which can take some seconds) runs afterwards in
// runScrapePhase, off the request's critical path.
export async function initJob(params: PipelineParams): Promise<PipelineJob> {
  const now = new Date().toISOString();
  const job: PipelineJob = {
    id: uuid(),
    status: "running",
    phase: "scraping",
    configName: params.configName,
    params,
    config: null,
    pending: [],
    cursor: 0,
    videosTotal: 0,
    videosAnalyzed: 0,
    creatorsTotal: 0,
    activeTask: null,
    log: [],
    errors: [],
    startedAt: now,
    updatedAt: now,
  };
  pushLog(job, `Loading config "${params.configName}" and scraping creators…`);
  await putJob(job);
  return job;
}

// Phase 1: scrape + build the pending list, then kick off the first worker (or
// complete immediately if there's nothing new to analyze).
export async function runScrapePhase(job: PipelineJob, base: string): Promise<void> {
  try {
    const { config, creatorsTotal, pending, log, errors } = await scrapeAndBuildPending(job.params);
    job.config = config;
    job.creatorsTotal = creatorsTotal;
    job.pending = pending;
    job.videosTotal = pending.length;
    job.errors.push(...errors);
    log.forEach((l) => pushLog(job, l));

    if (pending.length === 0) {
      job.phase = "done";
      job.status = "completed";
      pushLog(job, "Nothing to analyze — everything for this config is already done.");
      await putJob(job);
      return;
    }

    job.phase = "analyzing";
    pushLog(job, `Analyzing ${pending.length} video(s), one per worker step…`);
    await putJob(job);
    await triggerWorker(base, job.id);
  } catch (err) {
    job.status = "error";
    job.phase = "done";
    job.errors.push(`Pipeline error: ${err instanceof Error ? err.message : err}`);
    pushLog(job, `Pipeline error: ${err instanceof Error ? err.message : err}`);
    await putJob(job);
  }
}

// Phase 2 (one step): process pending[cursor], persist the result, advance the
// cursor, then either trigger the next step or mark the job complete.
export async function advanceJob(jobId: string, base: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || job.status !== "running") return;

  // Defensive: job should always have a config by the analyzing phase.
  if (!job.config || job.cursor >= job.pending.length) {
    job.phase = "done";
    job.status = "completed";
    job.activeTask = null;
    pushLog(job, `Pipeline complete! ${job.videosAnalyzed}/${job.videosTotal} analyzed, ${job.errors.length} error(s).`);
    await putJob(job);
    return;
  }

  const video = job.pending[job.cursor];
  const label = `${video.views.toLocaleString()} views`;
  job.activeTask = { id: `video-${job.cursor}`, creator: video.username, step: "Downloading", views: video.views };
  await putJob(job);

  try {
    const record = await analyzeVideoToRecord(video, job.config, job.configName, (step) => {
      // Best-effort intermediate progress; failures to persist a step update
      // are non-fatal to the analysis itself.
      job.activeTask = { id: `video-${job.cursor}`, creator: video.username, step, views: video.views };
      void putJob(job);
      pushLog(job, `@${video.username} (${label}): ${step}`);
    });
    await appendVideoAsync(record);
    job.videosAnalyzed++;
    pushLog(job, `@${video.username} (${label}): done`);
  } catch (err) {
    job.errors.push(`@${video.username} (${label}): ${err instanceof Error ? err.message : err}`);
    pushLog(job, `Error — @${video.username} (${label}): ${err instanceof Error ? err.message : err}`);
  }

  job.cursor++;
  job.activeTask = null;

  if (job.cursor >= job.pending.length) {
    job.phase = "done";
    job.status = "completed";
    pushLog(job, `Pipeline complete! ${job.videosAnalyzed}/${job.videosTotal} analyzed, ${job.errors.length} error(s).`);
    await putJob(job);
    return;
  }

  await putJob(job);
  await triggerWorker(base, jobId);
}

// Map internal job state onto the PipelineProgress shape the UI already renders.
export function jobToProgress(job: PipelineJob): PipelineProgress {
  return {
    status: job.status === "running" ? "running" : job.status,
    phase: job.phase,
    activeTasks: job.activeTask ? [job.activeTask] : [],
    creatorsCompleted: job.creatorsTotal,
    creatorsTotal: job.creatorsTotal,
    creatorsScraped: job.creatorsTotal,
    videosAnalyzed: job.videosAnalyzed,
    videosTotal: job.videosTotal,
    errors: job.errors,
    log: job.log,
  };
}
