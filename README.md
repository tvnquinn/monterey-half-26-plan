# Monterey Half 26 Plan

> Temporarily housed in the Coursera MATLAB repo so it can be moved to `tvnquinn/monterey-half-26-plan` later.


SUB-2 half marathon coach

Personal adaptive training tracker for a Nov 8 half marathon (sub-2 stretch goal).

Hosted on **Vercel** with **Supabase** so you can open it from anywhere (phone, travel, Chicago, Italy).

## What it does

- Stores your **15-week plan** (Chicago + Italy constraints baked in)
- Syncs **detailed run stats** from Strava (distance, pace, HR, elevation, splits, calories)
- Matches runs to planned sessions and tracks weekly mileage
- Retunes **easy-pace guidance** from recent runs
- Emits **active recommendations** / plan-change signals
- Exports an **.ics calendar** of all planned sessions

## Deploy (recommended): Vercel + Supabase

### 1. Create Supabase tables

In your Supabase project → **SQL Editor**, run:

[`supabase/schema.sql`](./supabase/schema.sql)

### 2. Deploy the app on Vercel

From this folder:

```bash
cd running-coach
npx vercel
```

Or in the Vercel dashboard: **Add New Project** → import this repo → set **Root Directory** to `running-coach`.

### 3. Set environment variables (Vercel → Settings → Environment Variables)

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only) |
| `STRAVA_CLIENT_ID` | from Strava API settings |
| `STRAVA_CLIENT_SECRET` | from Strava API settings |
| `STRAVA_REDIRECT_URI` | `https://YOUR_VERCEL_DOMAIN/api/strava/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_VERCEL_DOMAIN` |

Redeploy after saving env vars.

### 4. Point Strava at your live URL

In [Strava API settings](https://www.strava.com/settings/api):

- **Authorization Callback Domain**: your Vercel domain (e.g. `sub2-coach.vercel.app`)
- Callback path used by the app: `/api/strava/callback`

### 5. First use on the live site

1. Open the Vercel URL on your phone
2. Tap **Connect Strava**
3. Tap **Sync runs**
4. Tap **Add to calendar** for reminders

You can now use it away from home — data lives in Supabase, not on your laptop.

## Local development

```bash
cd running-coach
cp .env.example .env.local
npm install
npm run dev
```

- Without Supabase env vars, the app falls back to local `data/runs.json` (fine for laptop-only testing).
- With Supabase env vars locally, it uses the same cloud DB as production.

## OpenClaw (optional)

`POST /api/openclaw/ingest` accepts a run JSON (or array) and upserts into the same store.

## Plan source

Edit `data/plan.json` to change weekly mileage, sessions, or pace defaults. Redeploy (or run locally) after edits.
