import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import type { Config, Creator, Video } from "./types";

// ---------------------------------------------------------------------------
// Storage strategy:
//   - Locally: read/write CSV files in data/ (next to app/)
//   - On Vercel: use Vercel KV (Redis) for persistence across invocations
// ---------------------------------------------------------------------------

const IS_VERCEL = !!process.env.KV_REST_API_URL;

// ---- KV helpers (only imported on Vercel to avoid build errors locally) ----

async function kvGet<T>(key: string): Promise<T[] | null> {
  const { kv } = await import("@vercel/kv");
  return kv.get<T[]>(key);
}

async function kvSet<T>(key: string, value: T[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(key, value);
}

// ---- Local CSV helpers ------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "..", "data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readCsvSync<T>(filename: string): T[] {
  const filepath = path.join(DATA_DIR, filename);
  if (!existsSync(filepath)) return [];
  const content = readFileSync(filepath, "utf-8");
  if (!content.trim()) return [];
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as T[];
}

function writeCsvSync(filename: string, data: Record<string, unknown>[], columns: string[]) {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  writeFileSync(filepath, stringify(data, { header: true, columns }), "utf-8");
}

// ---- Configs ----------------------------------------------------------------

const CONFIG_COLUMNS = ["id", "configName", "creatorsCategory", "analysisInstruction", "newConceptsInstruction"];

export async function readConfigsAsync(): Promise<Config[]> {
  if (IS_VERCEL) {
    return (await kvGet<Config>("configs")) ?? [];
  }
  return readCsvSync<Config>("configs.csv");
}

export async function writeConfigsAsync(configs: Config[]): Promise<void> {
  if (IS_VERCEL) {
    await kvSet("configs", configs);
  } else {
    writeCsvSync("configs.csv", configs as unknown as Record<string, unknown>[], CONFIG_COLUMNS);
  }
}

// Sync shims for any legacy call sites
export function readConfigs(): Config[] {
  if (IS_VERCEL) throw new Error("Use readConfigsAsync on Vercel");
  return readCsvSync<Config>("configs.csv");
}
export function writeConfigs(configs: Config[]) {
  writeCsvSync("configs.csv", configs as unknown as Record<string, unknown>[], CONFIG_COLUMNS);
}

// ---- Creators ---------------------------------------------------------------

const CREATOR_COLUMNS = ["id", "username", "category", "profilePicUrl", "followers", "reelsCount30d", "avgViews30d", "lastScrapedAt"];

function parseCreators(raw: Record<string, string>[]): Creator[] {
  return raw.map((r) => ({
    id: r.id || "",
    username: r.username || "",
    category: r.category || "",
    profilePicUrl: r.profilePicUrl || "",
    followers: parseInt(r.followers || "0", 10) || 0,
    reelsCount30d: parseInt(r.reelsCount30d || "0", 10) || 0,
    avgViews30d: parseInt(r.avgViews30d || "0", 10) || 0,
    lastScrapedAt: r.lastScrapedAt || "",
  }));
}

export async function readCreatorsAsync(): Promise<Creator[]> {
  if (IS_VERCEL) {
    return (await kvGet<Creator>("creators")) ?? [];
  }
  return parseCreators(readCsvSync<Record<string, string>>("creators.csv"));
}

export async function writeCreatorsAsync(creators: Creator[]): Promise<void> {
  if (IS_VERCEL) {
    await kvSet("creators", creators);
  } else {
    writeCsvSync("creators.csv", creators as unknown as Record<string, unknown>[], CREATOR_COLUMNS);
  }
}

export function readCreators(): Creator[] {
  return parseCreators(readCsvSync<Record<string, string>>("creators.csv"));
}
export function writeCreators(creators: Creator[]) {
  writeCsvSync("creators.csv", creators as unknown as Record<string, unknown>[], CREATOR_COLUMNS);
}

// ---- Videos -----------------------------------------------------------------

const VIDEO_COLUMNS = ["id", "link", "thumbnail", "creator", "views", "likes", "comments", "analysis", "newConcepts", "datePosted", "dateAdded", "configName", "starred"];

function parseVideos(raw: Record<string, string>[]): Video[] {
  return raw.map((r) => ({
    id: r.id || "",
    link: r.link || r.Link || "",
    thumbnail: r.thumbnail || r.Thumbnail || "",
    creator: r.creator || r.Creator || "",
    views: parseInt(r.views || r.Views || "0", 10) || 0,
    likes: parseInt(r.likes || r.Likes || "0", 10) || 0,
    comments: parseInt(r.comments || r.Comments || "0", 10) || 0,
    analysis: r.analysis || r.Analysis || "",
    newConcepts: r.newConcepts || r["New Concepts"] || "",
    datePosted: r.datePosted || r["Date Posted"] || "",
    dateAdded: r.dateAdded || r["Date Added"] || "",
    configName: r.configName || r["Config Name"] || "",
    starred: r.starred === "true",
  }));
}

export async function readVideosAsync(): Promise<Video[]> {
  if (IS_VERCEL) {
    return (await kvGet<Video>("videos")) ?? [];
  }
  return parseVideos(readCsvSync<Record<string, string>>("videos.csv"));
}

export async function writeVideosAsync(videos: Video[]): Promise<void> {
  if (IS_VERCEL) {
    await kvSet("videos", videos);
  } else {
    writeCsvSync("videos.csv", videos as unknown as Record<string, unknown>[], VIDEO_COLUMNS);
  }
}

export async function appendVideoAsync(video: Video): Promise<void> {
  const videos = await readVideosAsync();
  videos.push(video);
  await writeVideosAsync(videos);
}

export function readVideos(): Video[] {
  return parseVideos(readCsvSync<Record<string, string>>("videos.csv"));
}
export function writeVideos(videos: Video[]) {
  writeCsvSync("videos.csv", videos as unknown as Record<string, unknown>[], VIDEO_COLUMNS);
}
export function appendVideo(video: Video) {
  const videos = readVideos();
  videos.push(video);
  writeVideos(videos);
}
