# Learnings

Everything worth carrying forward from building and iterating this coach. Written so that picking the project up cold — months later, or for a different race — gives you the athlete profile, the model's calibration and *why each number is what it is*, the bugs already found, and the beliefs that turned out to be wrong.

**Read the "Corrections" section before trusting anything you remember.** Several confident claims in earlier versions of this file were disproved by real data.

Last substantive update: **17 Aug 2026**.

---

## 0. Where things stand — read this first

**Race:** Monterey Bay Half, 8 Nov 2026. **83 days out** as of 17 Aug.

| | |
|---|---|
| Estimate (raced today) | **2:25** |
| Projection (race day, on plan) | **2:15** |
| Confidence | medium |
| Odds | A 8% · A- 16% · **B 30%** · C 88% |
| Data | 68 runs, 57 with heart rate, 8 with splits |

**Weeks so far:** W1 7.4/11 (Chicago travel, met the 2-run constraint) ·
W2 0/12 (**flu — excused from adherence**) · W3 **14.69/15, 98%** — first
complete week since the illness · W4 5.1/18 after one day.

**Currently on:** W4, 18 mi, long 7 on Friday. Plan runs
`11/12/15/18/20/23.5/10/0/15.5/20/22.5/20.7/25.5/17.5/9.5` with longs
`5/6/7/8/7 → [Italy] → 6.5/7.5/9/6/12/7` and a peak of 25.5 mi.

**Two time trials are the highest-leverage sessions in the block:**
10K on **6 Sep** (pre-Italy, on the flat Cortina→Zuel rail path if the optional
Italy run happens) and 10K on **18 Oct**. Riegel swings the implied half
2:13 / 2:20 / 2:27 depending on whether he races, tempos, or jogs them — two of
those readings are worse than no data. **They only help if actually raced.**

**Recent trajectory:** the same downhill-out 4.5-route was run three times in
seven days, which controls for terrain almost perfectly:

| | pace | avg HR | EF | note |
|---|---|---|---|---|
| 11 Aug, 4.84 mi | 13:51 | 150 | 0.0289 | flagged `illness`, 19:00 |
| 14 Aug, 6.16 mi | 12:41 | 154 | 0.0307 | long run, 16:00 |
| **17 Aug, 5.10 mi** | **12:27** | **147** | **0.0328** | easy · progression, 19:00 |

Faster *and* seven beats cheaper than three days earlier. 0.0328 is his best
efficiency factor on anything ≥5 mi since 25 May.

**Size the gain honestly.** Raw EF reads +6.8% over 14 Aug, but two of his
known confounds sit in that gap: heart rate (−0.36%/bpm) and duration (63 min
vs 78 min, at −6%/hr). Strip both and the same-route improvement is
**about +2.5% in three days** — smaller than the headline, still real, and
enough to say the flu dip has cleared.

He ran this one in the evening rather than the afternoon and expected the
cooler air to flatter it. It doesn't: see *Time of day and temperature* in
Considered and rejected. He also reported **singing through the first four
miles** — an independent talk-test confirmation of the 141–147 bpm readings,
and the first time this block that perceived effort has been checked against
the watch.

---

## 1. Athlete profile — measured, not assumed

Everything here comes from watch data in `data/history.json` (68 runs, 57 with heart rate, Feb 2025 – Aug 2026).

| | |
|---|---|
| Prior half | **2:15:51**, 22 Jun 2025, 13.16 mi, avg HR **174**, max 188 |
| First half | 2:22:18, 8 Jun 2025, avg HR 171 |
| Max HR observed | **189** (during a half, never a max test) |
| All-time best week | **19.8 mi** |
| Median run, last 6 months | **4.50 mi** |
| Median training elevation | **36–42 ft/mi** (San Francisco) |
| Median run temperature | **62 °F** (range 52–77; only one run ever above 70) |
| Race | Monterey Bay Half, 8 Nov 2026 — flat (~3 ft/mi), ~58 °F |
| Goals | A `2:00` · A- `2:05` · **B `2:10` (design target)** · C `2:30` |
| Expected race HR | ~175 |

### Hard-won facts about how he responds

- **Built from zero to 13.1 in ~7 weeks (2025) on 90 lifetime miles.** Weekly volume peaked at 19.8.
- **The 2:22 → 2:15:51 jump in 14 days decomposes as ~2.4 min from racing harder (HR 171→174) and ~4.0 min from real fitness (EF +3.0%).** Don't quote the 6.5 min as pure fitness.
- **He never returns from a break at under 4 miles.** After 244 days off: 4.21 mi. After 21 days off: **10.06 mi**. After 13 days off while ill: 4.84 mi. Rebuild weeks that start below ~4.5 mi waste a week.
- **Durability is his strength; consistency is his limiter.** The May 2026 10-miler was 2h16m at HR 139–153 with **−1.4% decoupling** (excluding one climb mile). He can hold Z2 for half-marathon *duration* — he just can't yet hold it *fast*.
- **Intensity discipline is already fixed.** 2025: 12 of 13 runs ≥2 mi were Z3/Z4. 2026: 9 of 13 are Z2. Don't re-teach this lesson.
- **He likes a specific 4.5 mi route** with a start and a destination. Standardising easy days on it is training-neutral and adherence-positive — do it. It runs 190 ft downhill over the first two miles and gives most of it back later, so *within* a run on this route the early miles flatter pace and the late miles punish it. Three repeats in seven days (11/14/17 Aug) made it the cleanest terrain-controlled comparison in the whole dataset — worth preserving.
- **Talk test agrees with the watch.** He sang through the first four miles of the 17 Aug run, which the watch had at 141–147 bpm. His Z2 band (139–152) is not merely a number derived from his own range; it matches perceived effort.

### Efficiency factor history (speed per heartbeat, the core fitness signal)

```
2025-05  0.0339      2026-03  0.0336      2026-06  0.0303   ← stress dip
2025-06  0.0339      2026-04  0.0339      2026-07  0.0315   ← recovering
                     2026-05  0.0333      2026-08  0.0307–0.0328
```

August readings sit near the recent median, and the 17 Aug run (0.0328) is the
top of the band. The 11 Aug run is flagged `illness` and excluded.
**EF falls with run duration** (~7%/hr on his own runs), so a
78-minute long run reading 0.0307 is not worse than a 45-minute run reading
0.0315 — see *Considered and rejected* before treating that as decline.

He was at **PR-equivalent efficiency as recently as April 2026**. The current gap is ~7% and recent — regaining, not building from scratch.

---

## 2. Hard constraints

- **Long run Friday. Never Saturday.** Pickleball Sat/Sun, unplanned.
- Run days: **Tue · Wed · Fri (long) · Sun**. Four days.
- **Mon** heavy lower strength · **Wed** light strength after the easy run · **Thu full rest** (Higdon rests before the long run; this used to be a strength day and shouldn't be).
- Knee / calf history — protect easy days, don't stack quality early.
- Travel: Chicago late Jul/early Aug. **Italy 10–22 Sep**, with the week of 14 Sep a hard zero; first run back Wed 23 Sep.
- Weeks are Mon–Sun. Race is Sunday 8 Nov.

---

## 3. The model

`src/lib/fitness.ts` is the core. The estimate is **anchored on a real race result and moved by observed fitness change** — never inferred from scratch off training runs.

```
estimate = priorHalf
         × (1 − EF_trend_delta × 0.7)     damping: EF drift isn't all fitness
         × durabilityFactor(longest run)
         × volumeFactor(built weekly volume)
         − conditionsCredit                terrain only, see below
         [× blended 35% with Riegel if a genuine hard effort exists]

projection = blend(estimate, priorHalf, by confidence)
           − improvement credit earned from logged volume × adherence
```

`estimatedHalfSec` = **what you'd run today**. `projectedSec` = **race day, if you follow the plan** — and the goal odds come from the projection, not the estimate. Both are shown in the UI because conflating them is the single most natural misreading.

### Calibration decisions and their evidence

| Knob | Value | Why |
|---|---|---|
| EF damping | 0.7 | EF drift partly reflects weather, terrain, freshness |
| EF heart-rate normalisation | **−0.36%/bpm, referenced to 145** | EF is meant to be intensity-independent inside the aerobic zone; for him it is not. Inside the model's 16-week window his heart rate trends **+0.81 bpm/wk at R²=0.72** — 12.4 bpm across the window — because he has been running easy days progressively harder. Uncorrected that is **−4.05% of phantom decline, worth 3.85 min of race time**, and it also halves recovery of a real trend (0.22%/wk recovered against 0.50 true). Corrected: −0.01% phantom, 0.50 recovered. Coefficient fitted as `log(EF) ~ HR + duration + time` over the full history (n=17, R²=0.85) where HR and date are nearly independent (R²=0.02), then held **fixed** — fitting it alongside time inside a block hits the same collinearity trap that returned a zero slope for duration. |
| EF slope shrinkage | `slope² / (slope² + SE²)` | Ten efficiency readings scattered 0.0305–0.0344 (R²=0.05) still moved the estimate 2.4 min — one ordinary run could swing the projection more than a week of training. Shrinking by signal share fixes it. Chosen over an R² threshold because R² conflates scatter with sample size: a real +0.5%/wk trend under 8% noise has R²=0.08 but 77% signal at n=40, while his R²=0.05 at n=10 is 30%. |
| EF slope clamp | ±1.5%/wk | Nobody sustains more aerobic gain than that |
| Elevation cost | **0.20 s/mi per ft/mi** | Two independent methods agree: within-run regression over 22 mile-splits with HR controlled gives 0.489 s/ft of *net* change → ~2.2 min over 13.1 at his terrain; 0.20 on *cumulative* gain gives ~1.8 min. A whole-run regression says 0.64 but absorbs route choice — he picks hills on easy days. Deliberately conservative. |
| Heat credit | **none** | He trains in SF at a 62 °F median with one run ever above 70. His prior-half anchor was run at 56 °F. There is no heat penalty to refund. An earlier month-based rule handed out ~4 free minutes for "summer training." |
| Riegel floor | **40% of race distance** (5.24 mi) | The exponent is dependable within ~3×. A 3-mile rep session extrapolated 4.4× to a half and got blended at 35% weight. |
| Endurance effort | ≥10 mi **and** Z3+ HR | Distance alone let an *easy* 10-miler at HR 146 project a 2:42 half. |
| Long-run decay | full to 35 d, half at 120 d, gone at 240 d | A hard 56-day cutoff discarded a 10-miler at 69 days and reported his longest as 5.76 mi. |
| Confidence gate | uses **undecayed** longest inside 150 d | Gating on the decaying value made confidence flip medium→low overnight on a pure calendar tick. Fitness fades; the fact you ran 10 miles doesn't. |
| Race-experience credit | downside sigma 1.15 → ~1.03 | Two completed halves with <5% HR drift genuinely lower blow-up risk. Raises C and B; correctly leaves A alone — experience makes you safer, not faster. |
| Improvement credit | **30 s/wk × adherence** | Originally granted per calendar week regardless of training (~7 free min at 15 weeks). Then over-corrected to 20 s/wk, capping expected improvement at 4.2 min — about half what his own trainability supports when *regaining* a ~6% efficiency gap rather than building new. |
| Adherence | excused for illness, shrunk toward 1.0 | Measured over all finished weeks, it read 0.34 off one travel week and one flu week, cutting the credit by two thirds. Flagged weeks are excused; with few weeks finished it regresses toward 1.0 (2 pseudo-weeks). |
| Volume/durability bonuses | **race-week** load, discounted by adherence | These describe race day, so reading today's 6 mi/wk to project a race 13 weeks out conflated "where you are" with "where you'll be". The estimate already covers the former. |

### Run condition flags

`RunActivity.condition` (`illness` / `injury` / `heat` / `travel` / `altitude`) keeps a run in the mileage and durability totals but **out of the EF trend**. Set it from the manual log form ("Anything off?").

Worth the feature: one sick run on 11 Aug swung the trend from −1.3% (R²=0.01) to −5.8% (R²=0.16) and the estimate from 2:21 to 2:24 — three minutes of "fitness loss" that was a head cold, and it would have dragged for weeks because the trend fits over 16 weeks.

### Validation

- **Out-of-sample against his real 2:15:51**, using only data that existed the day before: predicted **2:20:24, error +4.5 min (3.3%)**. Unchanged — it validates against June 2025 and later runs cannot move it.
- **Pace-model backtest**, re-run 17 Aug over 33 held-out runs: MAE **45 s/mi** against a 68.5 s/mi naive-mean baseline → **skill +34%**. Earlier versions of this file quoted 37 s/mi and +42% over 30 runs; that was true of a smaller pool and is no longer what the script prints. See Corrections 14.
- Ridge + feature gating vs the original 7-feature OLS is roughly **tied** at n≈50 — currently 45.0 s/mi vs 41.3 for the old OLS, skill 0.342 vs 0.397. It's a small-sample safeguard, not an accuracy win. Don't claim otherwise.

---

## 4. Plan design rules for Quinn

Current shape (15 weeks, race 8 Nov):

```
wk    1    2    3    4    5     6    7   8     9   10    11    12    13    14   15
mi   11   12   15   18   20  23.5   10   0  15.5   20  22.5  20.7  25.5  17.5  9.5
long  –    5    6    7    8     7    –   –   6.5  7.5     9     6    12     7    –
                                  ↑TT                        ↑TT          peak
```

- **Peak 25.5 mi, peak long 12** — between Higdon Novice 2 and Intermediate 1. He has run this distance before; Novice 1 is too soft.
- **Long run is 40–47% of weekly volume, and that is correct.** See Corrections.
- **Two 10K time trials** (6 Sep pre-Italy, 18 Oct). Solo is fine.
- **Easy days at 4.5 mi** wherever load allows. Taper and race week keep shorter runs.
- **No cutback before a travel break.** The break *is* the de-load; tapering into it wastes a week.
- Every jump ≤ ~20% except the two post-break returns, which are returns rather than progressions.

### Why the time trials matter more than they look

The estimator needs a hard effort ≥5.24 mi at Z3+ to feed Riegel. Without one it reasons from the June 2025 race — on 1 Oct that would be a **466-day-old** anchor.

```
standing on 1 Oct, no Sept effort   est 2:23:37   method prior_only
standing on 1 Oct, with a 10K TT    est 2:18:11   method hard_effort
```

**A 5K does nothing** — 3.1 mi is under the Riegel floor; verified, the estimate doesn't move. Minimum useful TT distance is ~5.5 mi. A 5K is also poorly targeted for him: VO2max isn't his limiter.

**The TT only helps if it's actually raced.** Riegel from that 10K swings the implied half **2:13 / 2:20 / 2:27** depending on whether he races it, runs it at half pace, or jogs it. Two of those are worse than no data at all.

### Adherence sensitivity

Simulated forward from 12 Aug, standing on race morning:

| plan completed | miles | race-day projection | B odds |
|---|---|---|---|
| 100% | 209 | **2:11:22** | 41% |
| 90% | 188 | 2:12:39 | 33% |
| 80% | 167 | 2:13:22 | 28% |
| 60% | 126 | 2:17:12 | 18% |
| 0% | 0 | 2:21:09 | 8% |

Roughly **a minute per 10% of mileage** in the 80–100% band, steepening below. Adherence shows up far more in goal *odds* than in headline time. Assumes EF returns toward 0.0335 in proportion to volume run — that endpoint is an assumption, not a model output.

---

## 5. Comparison to published plans

| | weeks | run days | peak wk | peak long | long % | tune-ups | taper |
|---|---|---|---|---|---|---|---|
| **This plan** | 15 | 4 | 25.5 | 12 | 47% | 2 | 2 wk |
| Higdon Novice 1 | 12 | 4 | 23 | 10 | 43% | 2 | 1 wk |
| Higdon Novice 2 | 12 | 4 | 23 | 12 | 52% | 2 | 1 wk |
| Higdon Intermediate 1 | 12 | 5 | 34 | 12 | 35% | 2 | 1 wk |
| Pfitzinger (*Faster Road Racing*) | 12 | 5–7 | 46–63 | 16 | ~30% | — | — |

Sources: [Novice 1](https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/) · [Novice 2](https://www.halhigdon.com/training-programs/half-marathon-training/novice-2-half-marathon/) · [Intermediate 1](https://www.halhigdon.com/training-programs/half-marathon-training/intermediate-1-half-marathon/) · [Pfitzinger overview](https://runningwithrock.com/pete-pfitzinger-half-marathon-plans/)

The gap to Intermediate 1 is almost entirely its **fifth run day** — that's what buys the extra 8 miles, not longer runs. Pfitzinger is a different tier entirely and not a useful reference at this volume.

---

## 6. Corrections — earlier beliefs that were wrong

Kept explicitly, because they were stated confidently and repeated.

1. **"Long run should be 30–35% of weekly volume."** Wrong reference. That's marathon guidance where weekly volume is double. Higdon Novice 2 runs its long at **52%**; Novice 1 at 43%. At four days and low mileage, 40–47% is textbook.
2. **"Closest famous plan is Higdon Intermediate 1, long ladder to 10."** Intermediate 1 is 5 days, 34 mi peak, and its long ladder goes to **12**. The plan actually matched **Novice 1** almost exactly before being deliberately moved up.
3. **The seed data was fabricated.** Every number the app showed before 28 Jul — including a 2:12 estimate — was computed from 12 invented runs. Real data put it 10+ minutes slower.
4. **"You're ~2 min/mi slower than your 2025 peak."** True in raw pace, misleading in cause: he now runs at HR ~149 versus ~166 then. Much of the gap is deliberate intensity choice, not decline. Efficiency factor is the honest comparison.
5. **"+12.6% HR drift on the 7/27 run" read as fading.** It was a progression run — splits went 13:14 → 10:43. Without per-mile splits, decoupling and negative splits are indistinguishable.
6. **"Summer training understates cool-race fitness."** Not in San Francisco. See heat credit above.
7. **"The new pace model beats the old one."** At n≈50 they're tied (MAE 37.2 vs 34.0 earlier, skill 0.42 vs 0.47). The win is robustness at small n.
8. **"Strava Premium is needed for the data."** It isn't. The free bulk archive export (Settings → Download or Delete Your Account → Request Archive) gives original `.FIT` files at 1 Hz.
9. **"The new adherence scenarios are ~1.5 min faster."** They were *slower*. Stated without checking; caught by Quinn.
10. **"Your max HR is probably wrong and the zones may be throttling you."** Overstated. Same device throughout means consistent bias, and every use of HR in the model is a within-athlete comparison. Absolute accuracy doesn't matter here.
11. **The projection was too conservative, and it wasn't the estimate's fault.** At 89 days out it read 2:19 — worse than a PR set 14 months earlier off a smaller block, on a hillier course. Cause was three compounding things: adherence crushed by two disrupted weeks, volume bonuses read off *today's* 6 mi/wk instead of race-week load, and a 20 s/wk credit rate. Fixed together; projection moved 2:19:17 → 2:13:33.
12. **Logged a run on the wrong day** from a stale date in context. Run `date` before writing anything date-stamped — the reminder in context can lag the real clock by a day.
13. **Built a test that couldn't fail.** Checking whether duration normalisation removed a phantom EF trend, the first version generated synthetic runs *without* drift — so correcting for it could only add error. Confirm the confound is actually present in the fixture before measuring the fix.
14. **"MAE 37 s/mi, skill +42%" went stale and kept being quoted.** Re-running `backtest.mts` on 17 Aug gives **45.0 s/mi, skill 0.342** over 33 held-out runs — the figure in README and in this file was measured on a 30-run pool and was never refreshed as runs were added. Validation numbers decay; re-run the script before quoting one.
15. **The pace model has a one-sided bias on recent runs.** Its last five held-out predictions all came in *fast*: −53, −136, −76, −74, −56 s/mi (7/29 through 8/17). A model that misses in the same direction five times running is not simply noisy. Today's −56 is the second-smallest of the five, so the run reads as a step forward relative to recent form — but don't take the model's "expect ~11:32/mi" hint at face value while the bias is unexamined.

---

## 7. Bug catalogue

Every one of these shipped and was caught later. Check for the same class of error when extending.

**Estimation**
- Flat `bestPace × 0.78 × 13.1` — one downhill run moved the projection **28 minutes**.
- Riegel applied to easy runs — a 12:25/mi jog at HR 155 projected a **2:54** half.
- The hard-effort rule discarded his *actual half* — 13.15 mi at 10:20 sits only 6% under his median, so a speed-only test never fired.
- Riegel from a 3-mile rep session made **80% of the plan project faster than 100%**.
- Taper read as detraining: volume/durability keyed to the trailing 28 days, so race week looked like fitness loss.
- Improvement credit granted per calendar week regardless of training.
- Fixed uncertainty spread produced "94% for C" at 15 weeks out.

**Data integrity**
- `dedupeRuns` scored a `gpx-` id at +30 and heart rate at +5 — HR-less copies beat richer ones.
- `/api/openclaw/ingest` validated away `splits`, `temperature`, `condition` despite the columns existing.
- Duplicate `raw` key in `runToRow` silently dropped the condition flag.
- Imputed monthly-average paces were scored in the backtest — measuring the imputation, not the model.

**Time and state**
- `toISOString().slice(0,10)` for day keys — evening Pacific runs landed on the next UTC day.
- Hard thresholds on decaying quantities: confidence flipped medium→low on a date change with no training change.
- `buildCoachReport` filtered weeks to `id >= current`, so finished weeks vanished.

**Dead weight**
- `buildRecommendations` (~160 lines) shipped on every API response and was never rendered.

---

## 8. UI decisions that stuck

- Tabs: **This week · Summary · Log · Recent**. Week scroller opens on the current week; finished weeks stay, dimmed and labelled "done".
- **Week cards are for scanning, Recent is for detail.** Splits tables and full stats belong on Recent, not inside a week card.
- Off-schedule runs **absorb** the planned session they most resemble (distance-dominant, date as tiebreak). Planned line struck through, actual run beneath — never delete what was asked for.
- Runs get a character assessment (`easy` / `steady` / `hard` / `long`, plus progression detection) that deliberately **does not reuse `SessionType`** — a 2.9 mi jog that drifted into Z3 is not a "threshold session".
- One estimated pace per row, not a band. Non-run sessions in a distinct warm hue.
- Show **both** "if you raced today" and "race day, on plan" — the odds come from the second.
- Single % per goal. Dates as `7/27`. Dim theme for night phone use.

---

## 9. Operations

**The GitHub repo is the only durable copy.** The local scratchpad has been
wiped mid-session twice — once losing `node_modules`, once losing `.git/HEAD`
and `package.json` while leaving `data/` intact. Recovery is `git clone`, then
re-apply anything uncommitted. Commit run data promptly; don't leave a logged
run sitting uncommitted.

**Deploy:** push to `main` → Vercel auto-deploys. No CLI token needed.
**Live:** https://half-marathon-plan-kappa.vercel.app

**Sync run data to production:**
```bash
curl -X POST https://half-marathon-plan-kappa.vercel.app/api/openclaw/ingest \
  -H "Content-Type: application/json" --data @runs.json
```
Storage is Supabase; `data/runs.json` is local-only and gitignored. Note Supabase stores timestamps in UTC — `runDayKey` converts back to Pacific, so a run logged at 19:00 PT appears as the next day in raw rows and the correct day everywhere else.

**Scripts:**
```bash
npx tsx scripts/validate-history.mts      # out-of-sample vs his real half
npx tsx scripts/backtest.mts              # pace model, old vs new
npx tsx scripts/simulate-adherence.mts    # projection at 100/90/80/60% of plan
npx tsx scripts/explain-projection.mts    # estimate → projection, step by step
npx tsx scripts/elev-analysis.mts         # grade cost fitted from his splits
```

---

## 10. Considered and rejected

Ideas that looked right, were built and measured, and did not survive. Don't
re-litigate without new evidence.

**Time of day and temperature** — measured on 17 Aug because he ran in the
evening and guessed the cooler air had helped. It hadn't.

```
temperature, direct           -0.06%/degF   R2=0.002   n=25, range 52-77F
hour of day, raw              -0.26%/hour   R2=0.017   n=40
hour of day, duration-held    -0.38%/hour   R2=0.019   n=40   (2026 only: -0.69%)
```

Both coefficients are noise, and the hour-of-day sign is *negative* — later
runs are marginally worse, not better — so a cool evening cannot be used to
explain away a good reading. This is the same answer the heat credit already
gives for the opposite case: San Francisco's range is too narrow for weather
to matter to him.

The trap worth naming: a raw split by time bucket looks like it shows
something (morning 0.0349 vs afternoon 0.0332), but his morning runs are his
*short* runs, and EF falls with duration. Holding duration fixed collapses it.
The same multiple regression recovers duration at **−6.05%/hr** across 40
runs, close to the ~7%/hr quoted above from n=17 — a useful independent check
on a number the model leans on.

**Normalising for run duration** — rejected, unlike the heart-rate correction
above, which was measured the same way and kept. EF genuinely falls as a run
lengthens — cardiac drift, measured at ~7%/hr across his own runs (n=17,
R²=0.18). The worry was that lengthening long runs would read as fitness
decline. Two attempts:

1. *Duration as a covariate in the trend regression.* Fails outright. In a
   training block, duration and date are collinear, and on synthetic athletes
   with a known +0.5%/wk trend the recovered slope collapsed to **zero**.
2. *Fixed 5%/hr normalisation before fitting.* Works mechanically — synthetics
   recover 0.47%/wk against 0.50 true — but measuring the actual benefit showed
   it was not worth it. Simulating the whole plan at constant fitness with real
   drift baked in, the uncorrected phantom trend is **0.19 min** of race time;
   corrected, 0.06 min. A 0.13-minute gain, against a change that moved his
   live trend from −0.8% to −3.4% on the strength of a single May long run,
   with no ground truth to validate against.

The confound is real but immaterial *at this plan's shape*, because long runs
are spread through the block rather than concentrated late. If a future plan
stacks its longest runs in the final weeks, re-measure before assuming the same.

## 11. Known model blind spots

Things the model cannot see, so don't let a flat projection talk you out of them.

- **No explicit detraining term for a gap.** A 14-day break registers only
  indirectly, through the trailing 4-week volume average. Splitting a two-week
  gap into two one-week gaps is worth real fitness physiologically and moves the
  estimate by ~9 seconds. Trust the physiology, not the dashboard.
- **`longest run` is a max, not a distribution.** Once something ≥8 mi sits in
  the window, additional long runs below that are invisible to the estimate even
  though they build durability.
- **Cross-training and strength are uncounted.** 23 pickleball and 23 strength
  sessions sit alongside 39 runs in the export. Real training load is well above
  displayed mileage.
- **Heat, altitude and travel are only handled by manual `condition` flags.**
  Nothing is inferred. Flagging matters: a 6.5 mi run at 1220 m logged unflagged
  read as **−8.0% EF** and cost 8 minutes of estimate, because it was the only
  run in a two-week window and the trend leaned on it.
- **`builtLongest` uses raw distance**, not duration or grade-adjusted distance.
  A hard mountain 7-miler counts as less durability than an easy flat 9-miler.
  Think in time on feet when terrain or altitude is unusual.
- **`durabilityFactor` is a step function** with edges at 5/7/9/11 mi. Crossing
  9.0 is worth ~2 min; 8.9 → 9.0 is worth the same as 8.0 → 9.0. Do not plan
  training around a bracket edge — it is a lookup table, not physiology.

## 12. Open items

- **Strava bulk archive** (`.FIT`, 1 Hz) would give per-second altitude and speed — enough to fit his true grade-adjusted pace curve and replace the 0.20 constant with a measured one. Currently the largest single source of modelling uncertainty.
- **March 2026 is partially reconstructed.** Nine runs, 37.87 mi, transcribed from workout screens; the HAE export window starts 28 Apr.
- **Absolute max HR is unknown, and that's fine.** 189 was recorded during a half rather than a max test, so 174 average reads as 92% of max — implausibly high in absolute terms. But every reading comes from the same Apple Watch, so whatever bias exists is *consistent*, and the model only ever compares his readings to each other: efficiency factor is a ratio across his own runs, and the zones are derived from his own observed range. Don't chase a "true" max — it would change the physiological story and none of the maths.
- **Pickleball and strength load are invisible.** The export shows 23 pickleball and 23 strength sessions alongside 39 runs. Real training load is well above the running mileage the app displays — a reason to stay conservative on volume jumps.
- **Supabase has no temperature column.** Conditions credit computes to zero for him either way, but a hot-weather block would need the migration.
- Five runs still carry `raw.paceImputed` (Oct 2025, Apr 3/7/21 2026) — distance exact, pace from a month average, excluded from model fitting.
