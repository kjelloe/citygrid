# measurement — work items

*Written 2026-09-06. Every performance number cityviewer has produced came from SwiftShader
in headless Chromium: right about triangles and draw calls, meaningless about frame time. The
governor, the tiers and the 320k/140k/40k budgets were designed for a phone and an RTX 4090
and neither has drawn a frame. This lane puts real numbers under those decisions and adds the
one gate the lane started from and never built: the picture beside the reference shots. Same
rules as `workitems-cityviewer.md` §0. Do it after `workitems-mainline.md`.*

## D1 — The performance card (S) — **done 2026-09-08 as `slice-D1`**

`?perf=1` boots the real page into the sweep and ends with a JSON card and a Copy button;
`tools/perf_card.mjs` drives the same list under Playwright in **70 s** and writes
`reports/perf/swiftshader.json` (build `9efa0c0e4cc6`). The sweep is nine steps —
20/40/80/120-tile spans, a 14° pitch, ortho, night, `painted`, and a 60 m run in street mode —
and the SwiftShader row is **83.2 to 350.1 ms p50**, which is 3 to 12 fps and is the honest name
for what every earlier performance claim in this repository was about. `ui_smoke` presses Copy
and parses the clipboard (122 checks, 92 s, up from 66); `test/perf-sweep.test.js` argues about
the shape of the measurement in node.

**Two changes the sweep forced, both of them findings.** The fixture had no cars in it —
`saturatedCity` seeds buildings with no zoning demand behind them, so `tiles.traffic` was zero
and three gates have been measuring an empty road network (**Q70**); it takes a `traffic` option
now. And each step needs its own session, because the traffic sim never empties a link it has
filled and the steps were inheriting each other's cars — the night row read 700 ms because it
had six times the day row's traffic (**Q69**). The bake is measured on *arrival* in street mode,
not over the walk, because a chunk is 320 m and the leg is 60: **one chunk, 13 ms, against an
8 ms budget** (**Q71**).

**Goal.** A player, or Kjell, opens the game on a device, presses one thing, and gets a block
of numbers to paste.

**Do.**
- `?perf=1` (URL config, beside `?debug=1`): the game boots into a scripted sweep on the
  saturated 96×96 fixture — four spans in city mode at the default pitch, one at 20°, one from
  the pavement in street mode, one at night, one in `painted` — holding each for five seconds
  and recording the frame p50/p95, draw calls, triangles, the ladder's reason, the governor's
  sacrifices and the tier. The walker walks a fixed 60 m leg in the street shot so the bake
  path is exercised.
- The card is a JSON block rendered into a `<pre>` with a **Copy** button, plus
  `navigator.userAgent`, `devicePixelRatio`, `deviceClass()`, screen size, and the tier the
  boot chose. Nothing leaves the device; the player pastes it.
- The same sweep runs under Playwright as `tools/perf_card.mjs` so the SwiftShader numbers sit
  in the same shape as the real ones and the difference is visible.

**Tests.** The sweep script is pure data (`client/debug/perf-sweep.js`: a list of
`{ mode, span, pitch, time, style, seconds }`), tested for having every mode and every style
once. `ui_smoke` presses Copy and reads the clipboard text as JSON.

**Done when** `reports/perf/swiftshader.json` exists from the tool, and the card renders on the
real page.

## D2 — Real devices (S, needs Kjell's hardware) — **the desktop card is in, 2026-09-08; the phone is not**

`reports/perf/desktop-4090.json` — RTX 4090, Windows, Chrome 152, 2560×1440 at DPR 1.5, tier
`high`, build `cbbd27806158` (commit `2f26532`, the same tree as the SwiftShader baseline).
`node tools/perf_report.mjs` folds every card into `reports/perf/README.md`, one table per map,
with a column for what the governor gave up and a column for whether the row drew enough frames to
have tested it.

**The first real device found a defect in four minutes that eight months of SwiftShader could
not.** The card is a flat **p50 of 16.7 ms on all nine steps** — a locked 60 fps, a machine with
nothing to complain about — and it reports `pixel,ink,shadows,supersample` given up on every one
of them. The whole ladder, four seconds after the city loaded, permanently. `high.frameMs` was
**16** and a 60 Hz display delivers 16.666, so `p95 <= target` was false forever. Fixed in the same
slice (D5); the card is kept as collected, with a note, because it is the evidence.

**And a second finding that only a real screen could produce (Q77).** At the closest city zoom the
4090 draws **eight live street chunks — 258,536 of 289,086 triangles, 90% of the High budget**.
Every headless gate runs 1280×720 at DPR 1, where the ladder finds them unresolvable and draws
none, on any of the three maps. The most expensive thing this renderer builds has never appeared
in a city-zoom measurement.

**Still open:** the phone. D3 and D5 both want it, and a laptop without a discrete GPU would make
`deviceClass()`'s three-way split checkable.

**Goal.** One card each from the RTX 4090 desktop, a mid-range phone, and (if there is one) a
laptop without a discrete GPU.

**Do.**
- Kjell runs `?perf=1` on each; the cards go in `reports/perf/<device>.json` with the commit
  SHA in the filename or the file. The card already carries `build` — `client/precache.json`'s
  version, which is the hash of every file the game is made of, and needs no build step.
- `tools/perf_report.mjs` folds every card into `reports/perf/README.md`: one table per device,
  one row per sweep step, the governor's sacrifices in a column of their own. The table is the
  era for every tier number from then on (CLAUDE.md, measurement discipline).

**Done when** three cards are in the repo and the report exists. This item cannot be finished
by the coding ally alone.

## D3 — The tiers, re-tuned from the cards (M) — **blocked on the phone card (D2)**

One card is not a range. The 4090 sits at a flat 16.7 ms with the frame never near 20 and the
triangle count never near 320,000 except in the one view no headless gate has ever drawn — so
everything this item would do to High is "raise it", with nothing to say how far, and everything
it would do to Medium and Low is guesswork about a device that has never run the game. **Do not
start this until a phone card exists.** Tuning the tiers on the machine with headroom is exactly
how `high.frameMs` came to be 16 ms in the first place (D5).

Two things are ready for it when it does start: `reports/perf/README.md` folds every card into one
table per map, and **Q77** names the `budget_gate` row that has to exist first — a viewport at a
real desktop's pixel count, where the street chunks become resolvable at city zoom.


**Goal.** The tier table in `data/cityviewer.json` says what the devices measured, not what V2
guessed.

**Do.**
- For each device: which tier `deviceClass()` chose, whether the p95 met the tier's `frameMs`
  at every sweep step, and what the governor gave up to get there. A tier that meets its
  target only after sacrifices is mis-set: the sacrifice is a safety net, not the plan.
- **Start from Kjell's card, not from V8's prediction.** The one view a real machine draws in full
  — `city 20t`, eight live street chunks — is **289,086 of 320,000, 90% of the budget**, and it is
  a view no headless gate has ever produced (Q77). Everything else on that card sits between
  158k and 173k with the frame at a flat 16.7 ms, so High has headroom it is not using. The older
  framing, still worth reading: a night frame is **289,446 of 320,000** with the ladder run to
  "silhouettes only" because eight baked chunks at 33.7k each are 93% of the budget (Q68). The
  lever is `streetChunks` (9 at High, 4 at Medium) — one chunk fewer buys 33.7k — not the detail
  inside a chunk. If Medium's `carCap` of 200 binds on the phone, the cars want the crowd's
  nearest-eye helper (A49).
- Adjust `budget`, `streetChunks`, `carCap`, `pedCap`, `lamps`, `pixelRatio` and `post` per
  tier until the phone's Medium and the desktop's High meet `frameMs` at p95 with the governor
  idle on the daytime sweep and at most one sacrifice at night. Every change is a row in the
  dev-log with the card that motivated it. `deviceClass()` itself may need a third signal
  (`gpu` from `WEBGL_debug_renderer_info` when present) if the 4090 and the laptop land in the
  same class.
- The budget gate's `--tier` rows re-baseline; ruling 040's table is amended a second time
  with "measured on `<device>` at `<sha>`".

**Tests.** `test/settings.test.js`: the device-to-tier mapping for the three real cards;
`test/world.test.js`: the mirror still matches the file.

**Done when** the report shows every device inside its tier's target at p95 and the dev-log
names the numbers before and after.

## D4 — The reference compare sheet (S) — **done 2026-09-08 as `slice-D4`**

`node tools/compare_sheet.mjs` writes `reports/compare-transport-worlds.png`: each of the three
references beside a City Grid capture at the same aspect, with camera and counts in the caption.
Read by eye, and what it says is in the dev-log — ground colour is the largest difference, our
town has no edge, roofs are low-chroma, streets are wide for the houses, and the water is the one
row where the two halves are close.

**Two defects it found on the way.** `?life=1` did nothing in every screenshot this project has
ever taken: `tools/shoot.html` passed no `dt` and no `frameMs`, so `client/life/` never advanced
and there was never a moving car in a shot. And the saturated fixture turns out to be 1,129 copies
of one `res` definition (**Q72**), so the sheet shoots a played city — forty deputy years on
64×64, 294 buildings across five kinds — and says why in the file. Looking at the result then
found a third thing no test can (**Q73**): three-quarters of a played city's zoned ground is
empty, and empty zoning reads as a slab of asphalt.

**Goal.** The gate the lane started from: City Grid beside the Transport Worlds shots, from the
same kind of view, in one image.

**Do.**
- `tools/compare_sheet.mjs`: for each reference in `debugging/transport-world-*.png`, a
  matching City Grid capture — a low-pitch perspective view over a road with cars, a
  lakeside, a hill with a road up it — from the saturated fixture, at the reference's aspect,
  stitched side by side with the reference and a caption (seed, span, pitch, tier, style,
  commit). The composition is an HTML page rendered by Playwright, the way `style-sheet.mjs`
  already stitches its three; no `pixelmatch`, no dependency.
- A `compare` section in `reports/README.md` (or `RELEASE.md`) that shows the latest sheet.
  Judged by eye, on purpose: it is a picture of how far the target is, not a pass/fail.
- The references are Kjell's uploads and stay in `debugging/`; the sheet never redistributes
  them beyond the repo they are already in.

**Tests.** The camera specs for the three captures are data, tested for validity (pitch in
range, span in range). Nothing else is testable, and the item says so.

**Done when** `reports/compare-transport-worlds.png` exists and is linked from the release page.

## D5 — The governor, validated on the real thing (S, after D2) — **the desktop half is done, 2026-09-08 as `slice-D5`; the phone half is not**

**It was not acting within its patience window — it was acting on a machine with nothing wrong.**
`frameMs` was the refresh *interval* rather than a threshold above it: 16 ms at High against a
16.666 ms frame, 33 at Low and Medium against 33.33. Any machine locked to its refresh rate failed
the test forever and spent the entire ladder in four seconds, silently, because the frame time
stayed perfect the whole time — the sacrifice made no difference, so nothing complained. Now 20 ms
and 40 ms: 60 fps and 30 fps, each with a fifth of a frame of room, and one interval late still
costs a pass. `test/governor.test.js` fails if a tier's target ever drops back to its interval.

**And the reason nothing caught it:** the SwiftShader baseline drew **5 to 26 frames in a
five-second hold**. The governor ignores its first 10 samples and its window is 60, so no
measurement this project ever made exercised it at all. The card marks a thin row now.

**Still open, and it needs the phone:** whether p95 over 60 frames is the right trigger at all
(**Q75** — the 4090 drops one frame in twenty on two of the nine steps, which against a 20 ms
target still costs a rung).

**Goal.** The governor's one-second patience, its p95 window and its sacrifice order were
chosen by reasoning. The phone card says whether they were right.

**Do.**
- From the phone card: does the governor act within the patience window, does it stop after
  one sacrifice or run to the bottom, and does the picture change style at random when a chunk
  bakes (the failure PATIENCE_MS exists to prevent)? Adjust `PATIENCE_MS`, the window and
  `MIN_SAMPLES` with the card as the era; a chunk bake should never trip it.
- If a bake does trip it: the bake phases (E5 split them in two) split again, or the tier's
  `streetChunks` drops on the phone.

**Done when** the phone card shows the governor idle on the daytime sweep at Medium. The desktop
card shows it idle at High as of 2026-09-08; the phone is what is left.

## D6 — The big map and the steep map (S) — **done 2026-09-08 as `slice-D6`**

Three cards (`reports/perf/swiftshader{,-steep,-big}.json`) and the three gates re-run on each.
`saturatedCity` takes a `terrain` now, `walkthrough`/`passability`/`lanes_dump` take `<size>
<terrain>`, and the card takes `?perfMap=big|steep`. The numbers are in the dev-log; the short
version:

- **Q66 is answered.** The unculled water mesh is **3,556 triangles on 256×256 — 1.11% of the High
  budget**. It never becomes a problem at a size a player can start. (Caveat: a `river` fixture; a
  `coastal` map is mostly water.)
- **Q68 has a shape** — corrected the same evening under D5's era, because D6's first pass settled
  the city in seconds and reached a different city on a fast machine than a slow one. Re-measured:
  the night frame is **exactly what the day frame costs**, on all three maps, with the same ladder
  reason. At span 40 the chunks are already dropped and the night lives inside them. Where the
  night does bite is the close zoom on real hardware — **Q77**.
- **Q64 is answered, and terrain is the only variable.** Ungradeable corridors: 1.0% on 96
  `rolling`, 1.3% on 128, 0.8% on 256 — and **33% on a 128 `hilly`**, steepest street 59.3%.
- **New: Q74.** `walkthrough` **fails** on `hilly` — 80 cliffs where the ground rises over a metre
  in two. The gate had only ever run on `rolling`.
- **For the worker lane:** the model rebuild is **184.7 ms on 256×256**, 108.7 of it the lane
  graph. Q60 called 53.7 ms the number to beat.

*The traffic-independent findings above — water, corridors, grades, cliffs, rebuild times — are
unaffected by D5's re-measurement and stand as first written.*

**Goal.** Every cityviewer number was taken on a 96×96 `rolling` city and a few on a 128×128.
Three open questions say "measure it on a bigger or steeper map first", so this item is that
measurement and nothing else: no fix is started here.

**Do.**
- Add a 256×256 saturated row and a 128×128 `hilly` row to D1's sweep (`tools/lib/saturated.mjs`
  takes `size`; the terrain style needs an option). Record per row: model derivation time and its
  split (`lanes_dump`), `counts.waterTiles` and the water mesh's triangles (Q66: one unculled mesh
  for the whole map — on a 256 river map, how much of the frame is it?), the night frame at High
  and the ladder's reason (Q68), and `walkthrough`'s ungradeable-corridor count and steepest street
  (Q64: 934 of 2,161 corridors on `hilly` cannot make 15% at `reliefM` 0.5).
- Each number goes into the question it answers in `dev-questions.md`, with the fix it points at
  named but not built: a water mesh per region of chunks (Q66); one chunk fewer at High or a
  measured `streetChunks` per device (Q68); node heights allowed to move a few metres, or worldgen
  refusing to zone ground that steep (Q64 — the second half is a worldgen decision for Kjell).

**Done when** the three questions carry a number from a map bigger than the one they were asked
on, and `reports/perf/` has the two extra rows.

## Review after D5 (2026-09-09)

*Read on `dev_night` at `3dc1a22` (`main` is two commits behind it, both docs). Re-run by the
reviewer: the suite twice (green), `gates.mjs quick` **411 s of 480, 12 of 12** (budget_gate 102 s,
ui_smoke 101, a11y_smoke 45) and `gates.mjs render` **3 s of 120, 3 of 3** — all green. R4, T1, M1–M4, D1, D4, D6 and the desktop halves of D2 and D5 are **accepted**. R4's
fix is the right one (the lane reads R3's graded profile by arc length and `lanes_dump` fails over
0.3 m); T1's rule lives in one function and its null `traffic_gate` result is written up as what it
is; D5's governor finding is the best thing a measurement has produced in this project and the
frame target is now guarded in three places. Reading found one small defect and some housekeeping,
which are **M5** in `workitems-mainline.md`; the two real defects D1 and D5 found in the traffic
sim (Q69, Q76) and the missing `budget_gate` viewport (Q77) are **D7** and **D8** below, and
neither needs a phone.*

- **`traffic.busyAt(corridor, node)` ignores the node** (`void node`). It reports a crossing busy
  when any car on EITHER of the corridor's two block links is within the gap of the end of its
  link — and one of those links arrives at the far node, so a car that has already passed this
  crossing and is approaching the next one holds the pedestrians here. Over-cautious, not unsafe:
  crowds stand at give-way kerbs longer than the cars justify. Filter on `link.to === node`. → M5.
- **Review logs and a `reports/tmp/` directory are tracked.** `reports/review3-*.log` (the
  reviewer's own scratch, never meant for git) and `reports/tmp/r4-*.png` were committed in R4.
  → M5.
- **`RELEASE.md` is one measurement behind on three lines**: the frame at High quotes V8's
  289,446 (still `budget_gate`'s street-zoom night row, but D5's re-measured `city 40t` night is
  130,936 and the sentence should say which view it means); the model rebuild quotes 53.7 ms on a
  128 `rolling` where D6 has 68.3 on a 128 `hilly` and 184.7 on 256; and "`main` … one slice
  behind" is two. → M5, and the next release note.
- **Q66 and Q71 are closed** (A52, A53): both were answered by numbers and neither wants a slice.
  **Q64 and Q74 want Kjell**: is `hilly` a playable map or scenery? The recommendation is in Q64.

## D7 — Traffic that is a function of the roads (S) — Q69, Q76

**Goal.** The renderer-local traffic sim gives the same city on every machine and does not remember
where the camera has been. Two defects, one rule.

**Do.**
- **Density by time, not by frame.** `client/life/traffic.js` fills a link at one car per link per
  step; a 4090 at 60 fps reaches 4,590 cars on the fixture where SwiftShader reaches 1,546 in the
  same warm-up (Q76). Spawn and despawn become a rate per second scaled by `dt` (the delta the
  module already takes and ignores for density), so the equilibrium is a property of the load and
  the cap, not of the frame rate.
- **A link that leaves the view empties.** Cars are spawned only on screen (`onScreen`) and never
  removed when the link leaves it, so a session that pans across a city carries every car it has
  ever looked at: 1,546 → 9,222 across one sweep (Q69). Despawn off-screen links toward their
  load-derived density with a grace of a few seconds, the same shape as the street cache's
  `GRACE_MS`; on screen, nothing changes.
- The cap stays a cap; `?life=0` still freezes; A45's yields are untouched.

**Tests first.** `test/cars.test.js`: two runs of the same city at `dt = 1/60` and `dt = 1/10` for
the same simulated seconds land within 10% of the same car count; a link that was on screen and is
not for five seconds falls to its off-screen density; the total never exceeds the cap.

**Gate.** `lanes_dump` prints the settled count at two step sizes. `tools/perf_card.mjs` re-run on
SwiftShader: the `settled` column is true on more than three rows and the car count is within 10%
of the 4090 card's on every row — that is the whole point. Every gate that counts cars
re-baselines (`budget_gate`'s three car rows, the crowd row, the night row) and the dev-log carries
before and after.

**Must not change:** `engine/traffic.js`, any fixture hash, the IDM constants.

## D8 — The desktop viewport in `budget_gate` (S) — Q77

**Goal.** The most expensive thing the renderer builds appears in a city-zoom measurement on
SwiftShader, so a regression in it goes red before a person sees it.

**Do.**
- `budget_gate` gains a second viewport for the city-mode rows: 2560×1440 at DPR 1.5 (the 4090's
  configuration, where `tilePixels` makes the street chunks resolvable at span 20) beside the
  existing 1280×720 at DPR 1. Only the High tier at spans 10 and 20 need the big viewport — four
  rows, not thirty-two — because that is where the chunks live.
- The expected numbers are already known from the card: eight live chunks, about 258k of 289k
  triangles at `city 20t`. The row asserts chunks > 0 and the frame inside budget, and prints the
  chunk share.
- `client_smoke`'s draw-call cap (80) is checked at the big viewport too, once.

**Tests.** `test/gates.test.js` unchanged; `test/lod.test.js`: `tilePixels` at 1440 px of canvas
height and span 20 is above `RESOLVE.l3`, and at 720 px it is not — the two sides of the threshold
Q77 names, as one assertion each.

**Gate.** `budget_gate` green with the new rows; the `quick` set's time recorded (the big viewport
on SwiftShader will be slow — if it adds more than a minute, the rows go to the `render` set).

## Order

D1 → D2 → D4 (needs only D1's harness and the fixture) → D6 → D3 → D5. D2 and D3 wait on Kjell;
D4 does not and is the quickest visible result; D6 is a morning with the harness D1 built.

**After the review of 2026-09-09:** M5 (`workitems-mainline.md`) → **D7 → D8** → then
`workitems-film.md` F1 while the phone card is awaited. D3 and the rest of D5 start the day a phone
card lands, and D7 must land before that card is compared with the desktop one.

**Where this lane stands, 2026-09-08 (evening).** **D1, D4, D6 and the desktop half of D2 and D5
are done.** The first real-device card found that the frame-time governor was giving up its entire
ladder on an RTX 4090 at a locked 60 fps, because every tier's target was its refresh interval
rather than a threshold above it — fixed, tested, and the reason no earlier measurement saw it is
that SwiftShader never drew enough frames to exercise the governor at all. **What is left wants a
phone**: D3 (re-tune the tiers) and the rest of D5 (Q75, the percentile) both read a Medium card
from a device that struggles, and there is no such card. `tools/perf_report.mjs` puts every card
that arrives into `reports/perf/README.md`.

*The earlier note, kept because its ordering advice still holds:* **D1, D4 and D6 are done** (`slice-D1`, `slice-D4`,
`slice-D6`): the card, the compare sheet, the SwiftShader baseline and the big/steep rows are all
in, and Q64, Q66 and Q68 now carry numbers from maps bigger and steeper than the ones they were
asked on. **What is left in this lane needs Kjell.** D2 is `?perf=1` on the 4090 desktop and on a
phone, with the cards saved into `reports/perf/<device>.json`; D3 (re-tune the tiers) and D5
(validate the governor) both read those cards and cannot start without them. Nothing here is
blocked on the coding ally.
