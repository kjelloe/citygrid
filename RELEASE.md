# City Grid — what this is, at this commit

*Written for two readers: somebody about to play it, and somebody about to work on it. Every
other document in this repository says what the game is meant to be. This one says what was
measured when somebody last looked, which is a different claim and the only one you can check.*

- **Commit:** `d112382` on `dev_night`, the end of the mainline lane. `main` is at `36aeefb`
  and fast-forwards to it; **neither has been pushed** — that is Kjell's to do.
- **Date:** 2026-09-08
- **Balance era:** era 1, tuned 2026-08-29 over 200 games per configuration
  (`reports/balance-era1.md`). Numbers from era 0 are void, not roughly comparable.
- **95 commits**, one per slice, no squash and no merge commits.

## Running it

```sh
./run.sh            # then open the printed URL — it boots straight into a playable city
./test.sh           # the suite, twice; a slice is not done until it is green both times
```

Build a road, zone beside it, place a power plant and a pump, and watch it grow. One finger
paints when a tool is selected and pans when none is; two fingers are always the camera. Tap
with no tool to inspect a tile. Press **F** in the street, or zoom past the closest span, to
stand in it.

There is no build step, no bundler and no runtime dependency in the game itself. `three.js` is
vendored and pinned; `ws` is the server's only dependency.

## What works

- **The singleplayer MVP.** All thirteen of `specs/gamedesign.md` §24's acceptance criteria pass
  as a script, driven by real pointer events on the real page, on desktop and on a 390×844 phone
  (`node tools/mvp_acceptance.mjs`).
- **A deterministic engine.** `apply(state, command) → state`; integer state, a seeded PRNG
  inside it, no I/O and no clocks. One hash function is the save checksum, the desync detector,
  the replay verifier and the multiplayer acceptance gate at once.
- **Offline.** A service worker precaches every file the game is made of, and a returning player
  gets the new build (`offline_smoke`, `update_smoke`).
- **The renderer**, rebuilt over twenty slices as *cityviewer*: three styles, two projections, a
  street camera you can walk in, baked street chunks at eye level with facades, shopfronts,
  props, pedestrians, traffic, signals, water and a time of day.

## The numbers

Every number below is from this commit on **SwiftShader**, which is software rendering. Nothing
here has run on a phone, and the frame-time governor exists for phones — see "what is missing".

**The triangle budget** (`data/cityviewer.json`, ruling 040 — the tier changes rendering only,
never the simulation):

| Tier | Triangles | Street chunks | Cars | People | Lamps | Post |
|---|---|---|---|---|---|---|
| Low | 40,000 | none | 60 | 0 | 0 | — |
| Medium | 140,000 | 4 | 200 | 40 | 5 | pixel |
| High | 320,000 | 9 | uncapped | 120 | 8 | pixel, ink |

**The gates**, all green, through the runner (`node tools/gates.mjs <set>`):

| Set | Gates | Time | What it is |
|---|---|---|---|
| `quick` | 12 | **380 s** | the ten browser smokes, the §24 acceptance script, `budget_gate` |
| `render` | 3 | **3 s** | `walkthrough`, `passability`, `lanes_dump` |
| `sim` | 3 | **595 s** | `disaster_soak`, `traffic_gate`, `sim_sweep` |

`ui_smoke` grew to 92 s in D1 (it now presses the performance card's Copy button and parses the
clipboard), so `quick` is about 400 s of its 480 s budget.

The slowest single gate is `budget_gate` at 104 s, then `ui_smoke` at 66 and `a11y_smoke` at 46.
Each run writes `reports/gates-<date>.json`.

**A frame at High**, on the saturated 96×96 fixture: 289,446 triangles of 320,000 at night with
eight baked street chunks; a chunk is 33.7k triangles and takes 7 ms of an 8 ms budget to bake.
A person is 42 triangles and a car 76.

**The city under it**: the model rebuild after a build action is 53.7 ms on a 128×128 (Q60 — it
is four frames, and it is on the render thread). The steepest street is 18.8% against a 15% limit,
with 8 corridors of 773 that no grading can fix because their two junctions are further apart
than that (Q64).

## What is missing, and known to be

**16 open questions** are on the list (`dev-questions.md`, bottom section). Each names what it blocks and the
assumption the code was built against, so each is cheap to reverse. The ones a reader should know
about:

- **Nothing has been measured on a real device.** Every number above is SwiftShader. The
  governor — the thing that decides what a phone gives up — has never run on one. This is still
  the largest gap in the project, but it now has an instrument: `?perf=1` runs a nine-step frame
  sweep on whatever device the page is open on and ends with a **Copy** button, and
  `node tools/perf_card.mjs` runs the same sweep here (70 s, `reports/perf/swiftshader.json`).
  The SwiftShader baseline is 83 to 350 ms p50 — 3 to 12 fps of software rendering. What is
  missing is somebody pressing the button on real hardware (`workitems-measurement.md` D2).
- **The simulation is on the render thread.** `specs/plan.md` §0 says "always a Web Worker" and
  `worker/` is empty. A 53.7 ms model rebuild sits beside a 4 ms tick (Q60).
- **Multiplayer is not started.** Ruling 003 holds Wave 5 behind the singleplayer MVP being
  *accepted*, and acceptance is a playtest, not a green suite. The seam is built in — commands
  cross the wire, not state — and nothing has crossed it yet. The territory overlay has no
  control because it is a multiplayer view (Q61).
- **Norwegian is drafted, not reviewed** (A21). Key parity is enforced by test and so is the
  harder question — no Norwegian string may be byte-identical to its English without a reason on
  a list — but the words have not been read by a Norwegian. The table is ready:
  `reports/i18n-review.md`, 414 strings with the slice that added each one.
- **Treasuries run away** — median 1.9M by year 25. Accepted with numbers rather than tuned away;
  the two attempts to fix it with upkeep both bankrupted weak cities without touching rich ones.
- Smaller ones, each with a note: the estimate's floor at the bottom of the LOD ladder (Q32), the
  two hidden faces of a building (Q39), whether a junction may move to keep a 15% grade (Q64),
  the water surface being one unculled mesh (Q66), and a night frame spending 93% of its budget
  on eight baked chunks (Q68).

## Where everything is

| File | What it is authoritative for |
|---|---|
| `specs/gamedesign.md` | what the game is |
| `specs/plan.md`, `specs/engine/` | how it is built; the renderer |
| `plan-v1.md`, `workitems-*.md` | what to do next |
| `specs/rulings/` | why a decision was made — 41 of them, one per file |
| `dev-log.md` | what actually happened, slice by slice, including the dead ends |
| `CLAUDE.md` | the working rules, and they are not suggestions |

## How it looks against the target

`reports/compare-transport-worlds.png` puts three City Grid captures beside the reference shots
they are aimed at — a lakeside, a town from above, a residential street — with the camera and the
triangle count on each. It is judged by eye, and the reading is in `dev-log.md` under `slice-D4`:
ground colour is the largest difference, the town has no edge against the countryside, and the
water is the one row where the two halves are close. `node tools/compare_sheet.mjs` rebuilds it.

`dev-log.md` is the most useful of these to a new developer: every entry carries the numbers its
gate produced and a "what failed on the way" section, and the failures are the part worth reading.
