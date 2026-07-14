import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import path from "path";
import type { Config, Creator, Invite, RunRecord, User, Video } from "./types";

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

// ---- Users --------------------------------------------------------------------

const USER_COLUMNS = ["id", "email", "name", "role", "passwordHash", "createdAt"];

export async function readUsersAsync(): Promise<User[]> {
  if (IS_VERCEL) {
    return (await kvGet<User>("users")) ?? [];
  }
  return readCsvSync<User>("users.csv");
}

export async function writeUsersAsync(users: User[]): Promise<void> {
  if (IS_VERCEL) {
    await kvSet("users", users);
  } else {
    writeCsvSync("users.csv", users as unknown as Record<string, unknown>[], USER_COLUMNS);
  }
}

// ---- Invites -------------------------------------------------------------------

const INVITE_COLUMNS = ["id", "role", "label", "createdBy", "createdAt", "expiresAt", "usedAt", "usedBy"];

export async function readInvitesAsync(): Promise<Invite[]> {
  if (IS_VERCEL) {
    return (await kvGet<Invite>("invites")) ?? [];
  }
  return readCsvSync<Invite>("invites.csv");
}

export async function writeInvitesAsync(invites: Invite[]): Promise<void> {
  if (IS_VERCEL) {
    await kvSet("invites", invites);
  } else {
    writeCsvSync("invites.csv", invites as unknown as Record<string, unknown>[], INVITE_COLUMNS);
  }
}

// ---- Pipeline runs (usage log) -----------------------------------------------

const RUN_COLUMNS = ["id", "configName", "startedBy", "startedAt", "status", "videosAnalyzed", "videosTotal"];
const RUNS_CAP = 500;

function parseRuns(raw: Record<string, string>[]): RunRecord[] {
  return raw.map((r) => ({
    id: r.id || "",
    configName: r.configName || "",
    startedBy: r.startedBy || "",
    startedAt: r.startedAt || "",
    status: (r.status as RunRecord["status"]) || "completed",
    videosAnalyzed: parseInt(r.videosAnalyzed || "0", 10) || 0,
    videosTotal: parseInt(r.videosTotal || "0", 10) || 0,
  }));
}

export async function readRunsAsync(): Promise<RunRecord[]> {
  if (IS_VERCEL) {
    return (await kvGet<RunRecord>("runs")) ?? [];
  }
  return parseRuns(readCsvSync<Record<string, string>>("runs.csv"));
}

export async function writeRunsAsync(runs: RunRecord[]): Promise<void> {
  const capped = runs.slice(-RUNS_CAP);
  if (IS_VERCEL) {
    await kvSet("runs", capped);
  } else {
    writeCsvSync("runs.csv", capped as unknown as Record<string, unknown>[], RUN_COLUMNS);
  }
}

export async function appendRunAsync(run: RunRecord): Promise<void> {
  const runs = await readRunsAsync();
  runs.push(run);
  await writeRunsAsync(runs);
}

export async function updateRunAsync(id: string, patch: Partial<RunRecord>): Promise<void> {
  const runs = await readRunsAsync();
  const idx = runs.findIndex((r) => r.id === id);
  if (idx === -1) return;
  runs[idx] = { ...runs[idx], ...patch };
  await writeRunsAsync(runs);
}

// ---- Storage health check ---------------------------------------------------

export interface StorageHealth {
  storageMode: "vercel-kv" | "local-csv";
  kvEnvConfigured: boolean;
  writable: boolean;
  roundTripOk: boolean;
  detail: string;
}

// Performs a real write -> read -> delete round-trip against whichever backend
// is active, so we can tell definitively (not by guessing) whether the
// deployment actually has durable, writable storage. This is the prerequisite
// for both reliable persistence and any background-job pipeline.
export async function storageHealthCheck(): Promise<StorageHealth> {
  const token = `hc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (IS_VERCEL) {
    try {
      const { kv } = await import("@vercel/kv");
      const key = `__healthcheck__:${token}`;
      await kv.set(key, [token]);
      const read = await kv.get<string[]>(key);
      await kv.del(key);
      const roundTripOk = Array.isArray(read) && read[0] === token;
      return {
        storageMode: "vercel-kv",
        kvEnvConfigured: true,
        writable: true,
        roundTripOk,
        detail: roundTripOk
          ? "Vercel KV write/read/delete succeeded — persistence is working."
          : "KV is reachable but the value read back did not match what was written.",
      };
    } catch (err) {
      return {
        storageMode: "vercel-kv",
        kvEnvConfigured: true,
        writable: false,
        roundTripOk: false,
        detail: `KV is configured but the round-trip failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Local / no-KV path: prove the data dir is actually writable.
  try {
    const filename = `__healthcheck__-${token}.csv`;
    writeCsvSync(filename, [{ token }], ["token"]);
    const read = readCsvSync<{ token: string }>(filename);
    const filepath = path.join(DATA_DIR, filename);
    if (existsSync(filepath)) rmSync(filepath);
    const roundTripOk = read[0]?.token === token;
    return {
      storageMode: "local-csv",
      kvEnvConfigured: false,
      writable: true,
      roundTripOk,
      detail: roundTripOk
        ? "Local CSV write/read/delete succeeded (fine for local dev, NOT durable on Vercel)."
        : "Wrote a file but read back the wrong value.",
    };
  } catch (err) {
    return {
      storageMode: "local-csv",
      kvEnvConfigured: false,
      writable: false,
      roundTripOk: false,
      detail:
        "No KV is configured AND the filesystem is not writable — writes are failing " +
        `silently in this environment. This is almost certainly why data does not persist. ` +
        `Raw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
