import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import path from "path";
import type { Config, Creator, Video } from "./types";

// On Vercel, the project root is read-only. We write to /tmp instead.
// On first read we copy the bundled seed file from data/ into /tmp so
// existing data (committed to the repo) is available after a cold start.
const IS_VERCEL = process.env.VERCEL === "1";
const SOURCE_DATA_DIR = path.join(process.cwd(), "..", "data");
const WRITE_DATA_DIR = IS_VERCEL ? "/tmp/social-media-data" : SOURCE_DATA_DIR;

function ensureDataDir() {
  if (!existsSync(WRITE_DATA_DIR)) {
    mkdirSync(WRITE_DATA_DIR, { recursive: true });
  }
}

function resolveReadPath(filename: string): string {
  const writePath = path.join(WRITE_DATA_DIR, filename);
  // If a writable copy exists (user has saved data this session) use it
  if (IS_VERCEL && existsSync(writePath)) return writePath;
  // Otherwise fall back to the bundled source file
  const sourcePath = path.join(SOURCE_DATA_DIR, filename);
  if (existsSync(sourcePath)) return sourcePath;
  return writePath; // will return [] from readCsv if missing
}

function seedToTmp(filename: string) {
  if (!IS_VERCEL) return;
  const tmpPath = path.join(WRITE_DATA_DIR, filename);
  if (existsSync(tmpPath)) return; // already seeded this session
  const sourcePath = path.join(SOURCE_DATA_DIR, filename);
  ensureDataDir();
  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, tmpPath);
  }
}

function readCsv<T>(filename: string): T[] {
  seedToTmp(filename);
  const filepath = resolveReadPath(filename);
  if (!existsSync(filepath)) return [];
  const content = readFileSync(filepath, "utf-8");
  if (!content.trim()) return [];
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true }) as T[];
}

function writeCsv(filename: string, data: Record<string, unknown>[], columns: string[]) {
  ensureDataDir();
  const filepath = path.join(WRITE_DATA_DIR, filename);
  const output = stringify(data, { header: true, columns });
  writeFileSync(filepath, output, "utf-8");
}

// Configs
const CONFIG_COLUMNS = ["id", "configName", "creatorsCategory", "analysisInstruction", "newConceptsInstruction"];

export function readConfigs(): Config[] {
  return readCsv<Config>("configs.csv");
}

export function writeConfigs(configs: Config[]) {
  writeCsv("configs.csv", configs as unknown as Record<string, unknown>[], CONFIG_COLUMNS);
}

// Creators
const CREATOR_COLUMNS = ["id", "username", "category", "profilePicUrl", "followers", "reelsCount30d", "avgViews30d", "lastScrapedAt"];

export function readCreators(): Creator[] {
  const raw = readCsv<Record<string, string>>("creators.csv");
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

export function writeCreators(creators: Creator[]) {
  writeCsv("creators.csv", creators as unknown as Record<string, unknown>[], CREATOR_COLUMNS);
}

// Videos
const VIDEO_COLUMNS = ["id", "link", "thumbnail", "creator", "views", "likes", "comments", "analysis", "newConcepts", "datePosted", "dateAdded", "configName", "starred"];

export function readVideos(): Video[] {
  const raw = readCsv<Record<string, string>>("videos.csv");
  return raw.map((r) => ({
    id: r.id || "",
    link: r.link || r.Link || "",
    thumbnail: r.thumbnail || r.Thumbnail || "",
    creator: r.creator || r.Creator || "",
    views: parseInt(r.views || r.Views || "0", 10) || 0,
    likes: parseInt(r.likes || r.Likes || "0", 10) || 0,
    comments: parseInt(r.comments || r.Comments || "0", 10) || 0,
    analysis: r.analysis || r.Analysis || "",
    newConcepts: r.newConcepts || r["newConcepts"] || r["New Concepts"] || "",
    datePosted: r.datePosted || r["Date Posted"] || r["datePosted"] || "",
    dateAdded: r.dateAdded || r["Date Added"] || r["dateAdded"] || "",
    configName: r.configName || r["Config Name"] || r["configName"] || "",
    starred: r.starred === "true",
  }));
}

export function writeVideos(videos: Video[]) {
  writeCsv("videos.csv", videos as unknown as Record<string, unknown>[], VIDEO_COLUMNS);
}

export function appendVideo(video: Video) {
  const videos = readVideos();
  videos.push(video);
  writeVideos(videos);
}
