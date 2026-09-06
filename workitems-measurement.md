# measurement — work items

*Written 2026-09-06. Every performance number cityviewer has produced came from SwiftShader
in headless Chromium: right about triangles and draw calls, meaningless about frame time. The
governor, the tiers and the 320k/140k/40k budgets were designed for a phone and an RTX 4090
and neither has drawn a frame. This lane puts real numbers under those decisions and adds the
one gate the lane started from and never built: the picture beside the reference shots. Same
rules as `workitems-cityviewer.md` §0. Do it after `workitems-mainline.md`.*

## D1 — The performance card (S)

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
  SHA in the filename or the file.
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

## D4 — The reference compare sheet (S)

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

## Order

D1 → D2 → D4 (needs only D1's harness and the fixture) → D3 → D5. D2 and D3 wait on Kjell; D4
does not and is the quickest visible result.
