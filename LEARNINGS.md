# Learnings from Quinn’s iterations

Preferences and product decisions distilled from building/iterating the Monterey Bay Half coach (Jul 2026). Use this when changing the plan or UI so we don’t re-learn the same things.

## Athlete & constraints

- **Athlete:** Quinn TV · race **Monterey Bay Half · 11/8/2026**
- **Design target = B `2:10` (~9:55/mi)**; A `2:00` is stretch; C `2:30` finish-strong
- **Prior half:** `2:15:56` → treat as **~2:16** (~10:23/mi)
- **True easy HR ~143 bpm**; 150+ usually surge/drift
- **HR zones (estimated):** Z1 ≤138 · Z2 139–152 · Z3 153–165 · Z4 166–179 · Z5 180+
- **Injury history:** knee / calf → protect easy days; don’t stack aggressive early quality
- **Travel:** Chicago late Jul/early Aug (max ~2 easy runs) · Italy **Sep 10–22** with **full zero week of Sep 14**; first run back **Wed Sep 23** (not on trip end day)
- Can run **Wed before Italy flight**; avoid packing runs onto travel day

## Schedule preferences

- Prefer **Friday long** + **Sunday short** (easy / strides / threshold / B-pace)
- **Never Sat + Sun**
- Default midweek: **Tue + Wed short 4th day** (~3 mi easy, or bike/elliptical if knee talks)
- **Strength 2×/week** (15 min: single-leg calf raises, hip abduction, step-downs) on non-run days
- Week 7 exception: **Tue + Wed** before Italy flight (no 4th day into travel)
- Weeks are **Mon–Sun**; race is **Sunday Nov 8** (Wed sharpen + Fri shakeout)

## Pace / speed (important)

- Easy ~12:00–12:40/mi does **not** need to become race pace overnight — easy stays easy (Z2)
- Quality workouts anchor to **B-pace ~9:45–10:00**, not A 9:09 (that’s threshold/VO2 for current fitness)
- Progression: strides → threshold Sundays alternating with B-pace practice → continuous B-pace miles
- Threshold = “comfortably hard, could hold ~1 hr” (2×8–10 min)
- Quality lives on **Sunday** after Italy rebuild; Friday stays the long
- Summer heat understates fitness vs cool Nov race; Monterey is flat — model credits both

## Training philosophy (vs famous plans)

- **Closest famous plan:** Hal Higdon **Intermediate 1** half (long ladder to **10**, late quality, 2-week taper)
- **4 run days/week** keeps long-run share nearer ~35–42% (3 days pushed longs to 45–48%)
- Rebuild after Italy: **13 → 16 → 19 → 16 cutback → 22 peak** (no five-week grind)
- Weekly `targetMi` is derived from non-optional non-race sessions; race week bar = training only
- Easy intensity is more **Daniels / 80-20 / Z2** than classic Higdon pace charts
- Peak long **10 mi**; Italy zero requires softer neighbors

## Plan / coaching rules that stuck

- Weekly mileage target = **one number**, not a wide band (e.g. `18`, not `15–22`)
- Show **over target** when logged > weekly target
- Progress bar = logged vs **that** target
- Dedupe near-duplicate runs (±1 day, similar distance) so mileage isn’t double-counted
- Odds / Est must **update from logged runs**, but stay **honest early-season** (no inflated sub-2 %)
- Single **%** per goal — not ranges like `20–30%`
- Collapsed per-session guidance → **flat rows** (no accordion): distance · pace band · HR zone · notes if any
- Don’t flood the UI with a separate “recommendations” card on the landing view

## UI / product preferences

### Information architecture

- Tabs: **This week · Summary · Log · Recent · Backtest** in **one horizontal scroll row**
- Landing = this-week cards (horizontal), guidance **collapsed under each run**
- **Summary** = all-week mileage + planned **long** + narrative (ahead / on track / behind)
- Log tab includes how updates work + screenshot / Health / manual
- Week scroller should **open on the current week**

### Branding & copy

- Title: **Monterey Bay Half 11/8**
- Subtitle: **Training plan · Quinn TV**
- Goals card titled **Goals** (A/B/C + Est)
- Dates as **7/27**, not `07-27`
- Cut unnecessary wording; labels should be self-explanatory or removed
- Removed confusing Pace / Conf / Easy grid (was meaningless without context)

### Visual

- Theme: **Monterey night** — cool water / fog / mountain, **dim for night phone use**
- Not neon lime / purple AI defaults
- Fonts: calm display (Fraunces) + readable body (Source Sans 3)
- Brand title readable on iPhone one line; Goals heading prominent; **% not oversized**
- Week cards **nearly full width** with a thin peek + edge fade so swipe is obvious
- Recent run stats on **one line** (`·` separated), not multi-column stacks

### Data entry reality

- Strava API subscription blocked full sync → prefer **GPX / Health JSON / screenshots / manual**
- Screenshot parse needs vision API key when used
- Seed / manual duplicates of the same outdoor run inflate weekly mileage — prefer GPX truth

## Things that bit us (avoid repeating)

1. Hard-capping upcoming weeks to 6 hid the rest of the plan
2. Wide weekly bands felt vague; single targets feel actionable
3. Early odds model over-credited “weeks left” → ~36% sub-2 felt too confident; honest early A closer to ~10%
4. Separate recommendation cards + wordy collapsed text created noise
5. Sat + Sun doubles conflicted with how Quinn actually trains
6. Peak long at 8 was too soft vs Higdon Intermediate 1 expectations
7. Hand-authored `targetMi` drifted from session sums → progress capped ~97%
8. Quality paced at A-goal when fitness is ~10:20 — injury bait; design around B
9. 3 days/week forced long runs to 43–48% of weekly volume
10. Italy end date + first rebuild run on same day (off-by-one)

## Open / optional later

- Health Auto Export auto-push if wanted
- Gemini/OpenAI key for screenshot logging
- Weather API instead of month heuristic for heat adjustment
- If fitness rises, tighten B-pace band toward A only when earned
