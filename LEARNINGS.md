# Learnings from Quinn’s iterations

Preferences and product decisions distilled from building/iterating the Monterey Bay Half coach (Jul 2026). Use this when changing the plan or UI so we don’t re-learn the same things.

## Athlete & constraints

- **Athlete:** Quinn TV · race **Monterey Bay Half · 11/8/2026**
- **A / B / C goals:** `2:00` / `2:10` / `2:30` (C is finish-strong, not prior half)
- **Prior half:** `2:15:56` → treat as **~2:16**
- **True easy HR ~143 bpm**; 150+ usually surge/drift
- **HR zones (estimated):** Z1 ≤138 · Z2 139–152 · Z3 153–165 · Z4 166–179 · Z5 180+
- **Injury history:** knee / calf → protect easy days; don’t stack aggressive early quality
- **Travel:** Chicago late Jul/early Aug (max ~2 easy runs) · Italy **Sep 10–22** with **full zero week of Sep 14**
- Can run **Wed before Italy flight**; avoid packing runs onto travel day

## Schedule preferences

- Prefer **Fri + Sun**
- **Never Sat + Sun** (one weekend run max — usually Sunday long/race)
- Default midweek: **Tue** (+ Fri + Sun)
- Week 7 exception: **Tue + Wed** before fly, then Italy stop
- Weeks are **Mon–Sun**; race is **Sunday Nov 8**

## Training philosophy (vs famous plans)

- **Closest famous plan:** Hal Higdon **Intermediate 1** half (long ladder to **10**, late quality, 2-week taper)
- Volume is still a bit under classic Int 1 peak (~25–30 mpw) because of **3 days/week** + Italy zero → feels like **Novice 2 → light Intermediate 1**
- Not Hansons / Pfitz denser midweek mileage
- Easy intensity is more **Daniels / 80-20 / Z2** than classic Higdon pace charts
- Peak long **10 mi** (Higdon Int 1 style); don’t leave peak long at 8
- Italy zero requires softer neighbors: capped pre-Italy week, gradual rebuild after (no jump straight into quality)

## Plan / coaching rules that stuck

- Weekly mileage target = **one number**, not a wide band (e.g. `18`, not `15–22`)
- Show **over target** when logged > weekly target
- Progress bar = logged vs **that** target
- Dedupe near-duplicate runs (±1 day, similar distance) so mileage isn’t double-counted
- Odds / Est must **update from logged runs**, but stay **honest early-season** (no inflated sub-2 %)
- Single **%** per goal — not ranges like `20–30%`
- Collapsed per-session guidance: **pace band + HR zone**, not long prose
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

## Open / optional later

- Move repo permanently to `tvnquinn/monterey-half-26-plan`
- Health Auto Export auto-push if wanted
- Gemini/OpenAI key for screenshot logging
- If fitness rises post-Italy, consider a fourth weekday only if recovery stays clean — default stays 3 days
