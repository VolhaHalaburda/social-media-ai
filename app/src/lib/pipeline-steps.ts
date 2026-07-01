import { v4 as uuid } from "uuid";
import { readConfigsAsync, readCreatorsAsync, readVideosAsync } from "./csv";
import { scrapeReels } from "./apify";
import { uploadVideo, analyzeVideo } from "./gemini";
import { generateNewConcepts } from "./claude";
import type { Config, PipelineParams, Video } from "./types";

// A competitor reel selected for analysis. Plain-JSON so it can be stored in a
// job record (Vercel KV) and carried across serverless invocations.
export interface ScrapedVideo {
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  datePosted: string;
}

export interface ScrapeResult {
  config: Config;
  creatorsTotal: number;
  pending: ScrapedVideo[];
  alreadyDone: number;
  log: string[];
  errors: string[];
}

// Phase 1 — resolve the config, scrape every creator in the category, rank by
// views, take top-K, and drop any reel already analyzed under this config.
// This is fast relative to the per-video AI work, so it runs in one shot.
export async function scrapeAndBuildPending(params: PipelineParams): Promise<ScrapeResult> {
  const log: string[] = [];
  const errors: string[] = [];

  const configs = await readConfigsAsync();
  const config = configs.find((c) => c.configName === params.configName);
  if (!config) throw new Error(`Config "${params.configName}" not found`);

  const allCreators = await readCreatorsAsync();
  const creators = allCreators.filter((c) => c.category === config.creatorsCategory);
  if (creators.length === 0) {
    throw new Error(`No creators found for category "${config.creatorsCategory}"`);
  }

  const cutoffDate = new Date(Date.now() - params.nDays * 24 * 60 * 60 * 1000);
  const allTopVideos: ScrapedVideo[] = [];

  const scrapeResults = await Promise.allSettled(
    creators.map(async (creator) => {
      const reels = await scrapeReels(creator.username, params.maxVideos, params.nDays);
      const videos = reels
        .filter((r) => r.videoUrl && r.timestamp)
        .map((r) => ({
          videoUrl: r.videoUrl,
          postUrl: r.url,
          views: r.videoPlayCount || 0,
          likes: r.likesCount || 0,
          comments: r.commentsCount || 0,
          username: r.ownerUsername || creator.username,
          thumbnail: r.images?.[0] || "",
          datePosted: r.timestamp?.split("T")[0] || "",
          timestamp: new Date(r.timestamp),
        }))
        .filter((v) => v.timestamp >= cutoffDate);

      videos.sort((a, b) => b.views - a.views);
      const topVideos = videos.slice(0, params.topK).map(({ timestamp: _t, ...v }) => v);
      log.push(`@${creator.username}: ${reels.length} reels → top ${topVideos.length} selected`);
      return topVideos;
    })
  );

  scrapeResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allTopVideos.push(...result.value);
    } else {
      const msg = `Scraping error (@${creators[i].username}): ${
        result.reason instanceof Error ? result.reason.message : result.reason
      }`;
      errors.push(msg);
      log.push(msg);
    }
  });

  // Resume support: skip reels already analyzed under this config so re-runs
  // (and chained job steps) never redo finished work. Keyed on link because
  // the same reel can legitimately be analyzed under a different config.
  const existingVideos = await readVideosAsync();
  const doneKeys = new Set(
    existingVideos.filter((v) => v.configName === params.configName).map((v) => v.link)
  );
  const pending = allTopVideos.filter((v) => !doneKeys.has(v.postUrl));
  const alreadyDone = allTopVideos.length - pending.length;
  if (alreadyDone > 0) log.push(`Skipping ${alreadyDone} video(s) already analyzed for this config`);

  return { config, creatorsTotal: creators.length, pending, alreadyDone, log, errors };
}

// Phase 2 (one unit) — download a single reel, run it through Gemini analysis
// and Claude concept generation, and return the finished record. Kept small on
// purpose: one call = one video, so it always fits inside a single serverless
// invocation's time budget.
export async function analyzeVideoToRecord(
  video: ScrapedVideo,
  config: Config,
  configName: string,
  onStep?: (step: string) => void
): Promise<Video> {
  onStep?.("Downloading");
  const videoResponse = await fetch(video.videoUrl);
  if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const contentType = videoResponse.headers.get("content-type") || "video/mp4";

  onStep?.("Uploading to Gemini");
  const fileData = await uploadVideo(videoBuffer, contentType);

  onStep?.("Gemini analyzing");
  const analysis = await analyzeVideo(fileData.uri, fileData.mimeType, config.analysisInstruction);

  onStep?.("Claude generating concepts");
  const newConcepts = await generateNewConcepts(analysis, config.newConceptsInstruction);

  return {
    id: uuid(),
    link: video.postUrl,
    thumbnail: video.thumbnail,
    creator: video.username,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    analysis,
    newConcepts,
    datePosted: video.datePosted,
    dateAdded: new Date().toISOString().slice(0, 10),
    configName,
    starred: false,
  };
}
