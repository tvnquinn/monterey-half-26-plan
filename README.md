# Monterey Bay Half 11/8 · Quinn TV

Personal half marathon training coach for **Monterey Bay Half (Nov 8, 2026)**.

**Live:** https://half-marathon-plan-kappa.vercel.app  
**Repo:** https://github.com/tvnquinn/monterey-half-26-plan

## iPhone: pin as a home-screen app

1. Open https://half-marathon-plan-kappa.vercel.app in **Safari** (not Chrome)
2. Tap the **Share** button (square with arrow)
3. Scroll and tap **Add to Home Screen**
4. Name it (e.g. `Monterey Half`) → **Add**

It opens full-screen like an app. For best results keep using Safari the first time.

## Start here

**[LEARNINGS.md](./LEARNINGS.md) is the living document.** Section 0 is a
current-state snapshot — race countdown, latest estimate, weeks completed, what
is next — so a cold start takes one read. Athlete profile from real
watch data, every model calibration and the evidence behind it, validation
results, the bug catalogue, comparison against published Higdon/Pfitzinger
plans, and a Corrections section listing beliefs that turned out to be wrong.

Read it before changing the plan or the model — several obvious-seeming ideas
have already been tried and disproved.

## What it does

- 15-week plan around real constraints (Friday long, never Saturday; Chicago
  travel; Italy 10–22 Sep with a hard zero week)
- Log runs via screenshots, Health JSON/GPX, or manual entry
- Matches runs to sessions; off-schedule runs absorb the planned session they
  most resemble, with the plan struck through rather than deleted
- Classifies what each run actually was (easy / steady / hard / long, plus
  negative-split detection) from heart rate and splits
- Four-tier goal odds (A / A- / B / C) from a race-day projection, with
  "if you raced today" shown alongside
- Half estimate anchored on his prior race and moved by efficiency-factor
  trend, Riegel from genuine hard efforts, durability and volume
- Runs can be flagged ill / injured / hot so a bad fortnight doesn't read as
  lost fitness
- Summary narrative, weekly mileage history, calendar `.ics` export

## Model at a glance

```
estimate    = what you'd run today
projection  = race day, if you follow the plan   ← the goal odds come from this
```

Validated out-of-sample against his real 2:15:51 half: **+4.5 min (3.3%)**.
Pace-model backtest over 33 held-out runs: **MAE 45 s/mi vs a 68.5 s/mi naive
baseline (skill +34%)**, re-measured 17 Aug 2026.

## Stack

- Next.js on **Vercel**
- **Supabase** for runs storage
- Plan source: `data/plan.json`

## Local development

```bash
cp .env.example .env.local   # if present
npm install
npm run dev
```

## Analysis scripts

```bash
npx tsx scripts/validate-history.mts      # out-of-sample vs his real half
npx tsx scripts/backtest.mts              # pace model, old vs new
npx tsx scripts/simulate-adherence.mts    # projection at 100/90/80/60% of plan
npx tsx scripts/explain-projection.mts    # estimate -> projection, step by step
npx tsx scripts/elev-analysis.mts         # grade cost fitted from his splits
```

## Syncing run data to production

```bash
curl -X POST https://half-marathon-plan-kappa.vercel.app/api/openclaw/ingest \
  -H "Content-Type: application/json" --data @runs.json
```

## Deploy

Vercel root = repo root (this project).

Needed env (typical):

| Name | Purpose |
|------|--------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server writes |
| `NEXT_PUBLIC_APP_URL` | public site URL |
| `GEMINI_API_KEY` or `OPENAI_API_KEY` | optional screenshot parse |

Schema: `supabase/schema.sql`
