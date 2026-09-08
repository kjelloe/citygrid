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

## D2 — Real devices (S, needs Kjell's hardware)

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

## D3 — The tiers, re-tuned from the cards (M)

**Goal.** The tier table in `data/cityviewer.json` says what the devices measured, not what V2
guessed.

**Do.**
- For each device: which tier `deviceClass()` chose, whether the p95 met the tier's `frameMs`
  at every sweep step, and what the governor gave up to get there. A tier that meets its
  target only after sacrifices is mis-set: the sacrifice is a safety net, not the plan.
- Start from where V8 left High: a night frame is **289,446 of 320,000** with the ladder run to
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

## D5 — The governor, validated on the real thing (S, after D2)

**Goal.** The governor's one-second patience, its p95 window and its sacrifice order were
chosen by reasoning. The phone card says whether they were right.

**Do.**
- From the phone card: does the governor act within the patience window, does it stop after
  one sacrifice or run to the bottom, and does the picture change style at random when a chunk
  bakes (the failure PATIENCE_MS exists to prevent)? Adjust `PATIENCE_MS`, the window and
  `MIN_SAMPLES` with the card as the era; a chunk bake should never trip it.
- If a bake does trip it: the bake phases (E5 split them in two) split again, or the tier's
  `streetChunks` drops on the phone.

**Done when** the phone card shows the governor idle on the daytime sweep at Medium.

## D6 — The big map and the steep map (S) — **done 2026-09-08 as `slice-D6`**

Three cards (`reports/perf/swiftshader{,-steep,-big}.json`) and the three gates re-run on each.
`saturatedCity` takes a `terrain` now, `walkthrough`/`passability`/`lanes_dump` take `<size>
<terrain>`, and the card takes `?perfMap=big|steep`. The numbers are in the dev-log; the short
version:

- **Q66 is answered.** The unculled water mesh is **3,556 triangles on 256×256 — 1.11% of the High
  budget**. It never becomes a problem at a size a player can start. (Caveat: a `river` fixture; a
  `coastal` map is mostly water.)
- **Q68 has a shape.** A bigger map makes the night frame *smaller* (224,466 against 96's 268,276)
  because the ladder drops trees earlier. The 256 run is the first measurement in which the
  governor has ever acted — it gave up `pixel`, on SwiftShader.
- **Q64 is answered, and terrain is the only variable.** Ungradeable corridors: 1.0% on 96
  `rolling`, 1.3% on 128, 0.8% on 256 — and **33% on a 128 `hilly`**, steepest street 59.3%.
- **New: Q74.** `walkthrough` **fails** on `hilly` — 80 cliffs where the ground rises over a metre
  in two. The gate had only ever run on `rolling`.
- **For the worker lane:** the model rebuild is **184.7 ms on 256×256**, 108.7 of it the lane
  graph. Q60 called 53.7 ms the number to beat.

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

## Order

D1 → D2 → D4 (needs only D1's harness and the fixture) → D6 → D3 → D5. D2 and D3 wait on Kjell;
D4 does not and is the quickest visible result; D6 is a morning with the harness D1 built.

**Where this lane stands, 2026-09-08.** **D1, D4 and D6 are done** (`slice-D1`, `slice-D4`,
`slice-D6`): the card, the compare sheet, the SwiftShader baseline and the big/steep rows are all
in, and Q64, Q66 and Q68 now carry numbers from maps bigger and steeper than the ones they were
asked on. **What is left in this lane needs Kjell.** D2 is `?perf=1` on the 4090 desktop and on a
phone, with the cards saved into `reports/perf/<device>.json`; D3 (re-tune the tiers) and D5
(validate the governor) both read those cards and cannot start without them. Nothing here is
blocked on the coding ally.
