# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

**Social Media AI** — a tool that helps create viral Instagram Reels by analyzing competitor content. It scrapes competitors' recent videos, identifies the most viral ones, analyzes them with AI (video understanding + content breakdown), and generates new adapted video concepts for a given brand.

---

## How to Run

```bash
cd app
npm install
npm run dev
# Open http://localhost:3000
```

**Required environment variables** (in `.env` at project root):
- `APIFY_API_TOKEN` — Apify Instagram scraper
- `GEMINI_API_KEY` — Google Gemini video analysis
- `ANTHROPIC_API_KEY` — Claude concept generation
- `AUTH_SECRET` — signs session cookies + the internal pipeline-worker token (`openssl rand -hex 32`)

On first visit with no users, `/login` shows a "create admin account" form; that account then invites others from the Team page.

---

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** components
- **CSV files** for data storage (in `data/` directory)
- **Apify** — Instagram scraping
- **Google Gemini 2.0 Flash** — Video analysis (upload + multimodal)
- **Claude Sonnet** — New concept generation

---

## How The System Works

### Pipeline Overview

1. **Input** — Select a config and parameters (max videos, top-K, days lookback) via the Run page
2. **Load Config** — Retrieve analysis prompt, new concepts prompt, and creator list from CSV
3. **Scrape** — For each competitor creator, scrape recent Instagram Reels via Apify
4. **Filter & Rank** — Filter by date, sort by views, take top-K most viral
5. **Analyze** — Download video, upload to Gemini, analyze (extracts Concept, Hook, Retention, Reward, Script)
6. **Generate** — Send analysis + brand context to Claude for adapted video concepts
7. **Save** — Append results to `data/videos.csv`, viewable in the Videos page with thumbnails

### Two Customizable Prompts Per Config

- **Analysis Instruction** — How Gemini should break down the video
- **New Concepts Instruction** — How Claude should adapt the reference for the brand

---

## Auth & Roles

Self-contained session auth — no external provider:

- **Sessions**: HMAC-SHA256-signed cookie (`vs_session`, httpOnly, 7 days), signed/verified with Web Crypto in `src/lib/session.ts` so it works in both the edge proxy and Node routes. Secret: `AUTH_SECRET`.
- **Users**: stored via the same storage layer as everything else (`data/users.csv` locally, KV `users` on Vercel), scrypt password hashes. `data/users.csv` and `data/runs.csv` are gitignored.
- **Gate**: `src/proxy.ts` (Next 16 middleware) redirects unauthenticated pages to `/login` and 401s APIs. Mutating routes re-check the user store via `requireUser`/`requireRole` in `src/lib/auth.ts`.
- **Roles**: `admin` (run pipeline, edit configs/creators, manage users on `/team`) and `editor` (browse videos/analysis/concepts, star videos; read-only configs/creators). Enforced server-side; UI hides what the role can't do (`useSession` from `src/context/session-context.tsx`).
- **Worker chain**: `/api/pipeline/worker` is exempt from cookie auth; it requires `x-internal-token` (HMAC derived from `AUTH_SECRET`) sent by `triggerWorker`.
- **Usage log**: every pipeline run is recorded (`data/runs.csv` / KV `runs`) with the email of the admin who started it; shown on `/team`.
- **First run**: with zero users, `/login` becomes a create-admin-account form (`/api/auth/setup`), then locks.

---

## Workspace Structure

```
.
├── CLAUDE.md                              # This file
├── .env                                   # API keys (not committed)
├── app/                                   # Next.js application
│   ├── src/
│   │   ├── app/                           # Pages and API routes
│   │   │   ├── page.tsx                   # Dashboard
│   │   │   ├── videos/page.tsx            # Videos browser with thumbnails
│   │   │   ├── run/page.tsx               # Pipeline runner with live progress
│   │   │   ├── configs/page.tsx           # Config management
│   │   │   ├── creators/page.tsx          # Creator management
│   │   │   └── api/                       # API routes (configs, creators, videos, pipeline)
│   │   ├── lib/                           # Core logic
│   │   │   ├── pipeline.ts               # Pipeline orchestration
│   │   │   ├── apify.ts                  # Apify scraper client
│   │   │   ├── gemini.ts                 # Gemini video analysis client
│   │   │   ├── claude.ts                 # Claude concept generation client
│   │   │   ├── csv.ts                    # CSV read/write utilities
│   │   │   └── types.ts                  # TypeScript interfaces
│   │   └── components/                    # UI components (shadcn + custom)
│   └── package.json
├── data/                                  # CSV data storage
│   ├── configs.csv                        # Pipeline configurations
│   ├── creators.csv                       # Instagram creator accounts
│   └── videos.csv                         # Analyzed video results
├── context/                               # Background context for Claude
├── plans/                                 # Implementation plans
└── .claude/commands/                      # Slash commands (prime, create-plan, implement)
```

---

## App Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Summary stats, recent videos |
| Videos | `/videos` | Browse results with thumbnails, expandable analysis & concepts |
| Run Pipeline | `/run` | Select config, set params, run with live progress streaming |
| Configs | `/configs` | CRUD for pipeline configs (prompts, categories) |
| Creators | `/creators` | CRUD for competitor Instagram accounts |
| Team | `/team` | Admin-only: user management + pipeline usage log |
| Login | `/login` | Sign in (or first-run admin setup) |

---

## Commands

### /prime
Initialize a new session with full context awareness.

### /create-plan [request]
Create a detailed implementation plan in `plans/`.

### /implement [plan-path]
Execute a plan step by step.

---

## Critical Instruction: Maintain This File

After any change to the workspace, ask:
1. Does this change add new functionality?
2. Does it modify the workspace structure documented above?
3. Should a new command be listed?
4. Does context/ need updates?

If yes, update the relevant sections.

---

## Session Workflow

1. **Start**: Run `/prime` to load context
2. **Work**: Use commands or direct Claude with tasks
3. **Plan changes**: Use `/create-plan` before significant additions
4. **Execute**: Use `/implement` to execute plans
5. **Maintain**: Claude updates CLAUDE.md and context/ as the workspace evolves
