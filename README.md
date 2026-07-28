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

## Learnings

See **[LEARNINGS.md](./LEARNINGS.md)** — preferences from Quinn’s iteration loops (schedule, goals, UI, Higdon comparison, pitfalls).

## What it does

- 15-week plan with Chicago + Italy constraints (Italy week of Sep 14 = zero running)
- Log runs via screenshots, Health JSON/GPX, or manual entry
- Matches runs to sessions; weekly mileage + long-run tracking
- Dynamic A/B/C goal odds + half estimate from logged runs
- Per-session pace (+ HR on RP/race days) on flat session rows
- Summary narrative (ahead / on track / behind)
- Calendar `.ics` export

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
