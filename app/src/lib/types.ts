export interface Config {
  id: string;
  configName: string;
  creatorsCategory: string;
  analysisInstruction: string;
  newConceptsInstruction: string;
}

export interface Creator {
  id: string;
  username: string;
  category: string;
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
  lastScrapedAt: string;
}

export interface Video {
  id: string;
  link: string;
  thumbnail: string;
  creator: string;
  views: number;
  likes: number;
  comments: number;
  analysis: string;
  newConcepts: string;
  datePosted: string;
  dateAdded: string;
  configName: string;
  starred: boolean;
}

export type Role = "admin" | "editor";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

// What the client (and session cookie) is allowed to know about a user.
export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export interface Invite {
  id: string; // the invite token — unguessable, single-use
  role: Role;
  label: string; // who this is for, e.g. "Rishi — eyewa" (shown to admin only)
  createdBy: string; // admin email
  createdAt: string;
  expiresAt: string;
  usedAt: string; // empty until redeemed
  usedBy: string; // email of the account that redeemed it
}

export interface RunRecord {
  id: string; // same as the pipeline job id
  configName: string;
  startedBy: string; // email of the user who triggered the run
  startedAt: string;
  status: "running" | "completed" | "error";
  videosAnalyzed: number;
  videosTotal: number;
}

export interface PipelineParams {
  configName: string;
  maxVideos: number;
  topK: number;
  nDays: number;
}

export interface ActiveTask {
  id: string;
  creator: string;
  step: string;
  views?: number;
}

export interface PipelineProgress {
  status: "idle" | "running" | "completed" | "error";
  phase: "scraping" | "analyzing" | "done";
  activeTasks: ActiveTask[];
  creatorsCompleted: number;
  creatorsTotal: number;
  creatorsScraped: number;
  videosAnalyzed: number;
  videosTotal: number;
  errors: string[];
  log: string[];
}
