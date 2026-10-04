# City Grid — what this is, at this commit

*Written for two readers: somebody about to play it, and somebody about to work on it. Every
other document in this repository says what the game is meant to be. This one says what was
measured when somebody last looked, which is a different claim and the only one you can check.*

- **Commit:** `8f1d80a` on `dev_night`, after the worker lane, the film's storyboard, the rules
  lane and twenty-six balance eras — which is what the numbers below were measured at. **`main` is
  the release and `dev_night` carries what has landed since**: `main` was pushed on 2026-09-08 at
  `2f26532`. This page named that commit until 2026-10-04, **129 commits and twenty-five eras
  later**, with every number on it measured against a game that no longer existed — so the docs
  test now fails past fifty commits of drift rather than printing a note nobody reads (M7).
- **Date:** 2026-10-04
- **Balance era:** era 26, re-measured 2026-10-04 over 200 games per configuration
  (`reports/balance-era26.md`). Numbers from an earlier era are void, not roughly comparable —
  and the frame numbers further down are renderer measurements, which belong to no balance era.
  This line said "era 1" until P91, five eras after the data stopped agreeing with it, because the
  doc test was pinning the words rather than reading `data/balance.json`.
- **229 commits**, one per slice, no squash and no merge commits.
- **1,671 tests**, green twice in a row on every slice (`./test.sh`), and nine gate sets.

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
- **The simulation is off the render thread.** `worker/sim-worker.js` owns the state and the page
  holds a mirror patched from the tile layers that changed; `tools/worker_smoke.mjs` plays the same
  46 commands and 200 ticks on both arms for the same hash, and `?worker=0` is the lever that
  forces the local one. Every change to the city is a command — undo included, since W4.
- **And since `main` was pushed** (on `dev_night`, measured but not released): a road crosses water
  on a deck with clearance for a boat under it, the shore is a bank rather than a quay, a street's
  verges are green from the air, rain falls at street level, a railway cuts and embanks instead of
  following the ground, the deputy will seek a river crossing when its own bank runs out, a street
  that stands a storey above the water has a faced wall with a coping, there are people on the
  pavements outside shops and schools at last (every non-residential building asked for nobody until
  B10), and the whole thing can be rendered as a sixty-second film from a shot list.

## The numbers

Every number below is from this commit on **SwiftShader**, which is software rendering. Nothing
here has run on a phone, and the frame-time governor exists for phones — see "what is missing".

**The triangle budget** (`data/cityviewer.json`, ruling 040 — the tier changes rendering only,
never the simulation):

| Tier | Triangles | Frame target | Street chunks | Cars | People (near / from the air) | Lamps | Post |
|---|---|---|---|---|---|---|---|
| Low | 40,000 | 40 ms | none | 60 | 0 / 0 | 0 | — |
| Medium | 140,000 | 40 ms | 4 | 200 | 40 / 200 | 5 | pixel |
| High | 400,000 | 20 ms | 9 | uncapped | 120 / 600 | 8 | pixel, ink |

The frame targets are thresholds with headroom, not refresh intervals: 20 ms is 60 fps with a fifth
of a frame of room, 40 ms is 30 fps with the same. They were the intervals themselves until D5,
which is what made the governor spend its whole ladder on a machine hitting 60 fps exactly.

**The gates**, all green, through the runner (`node tools/gates.mjs <set>`):

Measured 2026-10-04 at this commit, on SwiftShader, **one set at a time** — a set measured beside
another measures the machine. A gate time is only comparable within an era.

| Set | Gates | Time | Budget | What it is |
|---|---|---|---|---|
| `quick` | 12 | **512 s** | 540 s | the eleven browser smokes and the §24 acceptance script |
| `render` | 3 | **9 s** | 120 s | the two walks and `passability` |
| `lanes` | 1 | **215 s** | 360 s | `lanes_dump` — its own set since S18, because it was 95% of `render` |
| `budget` | 1 | **258 s** | 360 s | `budget_gate` — three tiers, two projections, four spans, two viewports |
| `shots` | 7 | **394 s** | 420 s | the world lane's picture gates, each counting what it photographed |
| `transport` | 4 | **187 s** | 300 s | T1–T4's pictures (last measured at T4b) |
| `kits` | 5 | **346 s** | 960 s | one picture per catalogue definition, per kit, per role, per street |
| `film` | 1 | **292 s** | 480 s | the sixty-second storyboard, every frame counted for triangles and for life |
| `sim` | 3 | **556 s** | 900 s | `disaster_soak`, `traffic_gate`, `sim_sweep` |

The slowest single gate is `budget_gate` at **258 s**, then `lanes_dump` at 215, `ui_smoke` at 203
and `embankment_shots` at 103. Each run writes `reports/gates-<date>.json`.

`quick` was 375 s when M2 measured it and set the budget as "the measurement plus room". By
2026-09-10 it had reached **477 s of 480** — three seconds of headroom — because the measurement
lane bought real coverage with time. M2's rule is that a gate which grows past its share is a
finding rather than a fact of life, so the budget was not raised: **`budget_gate` moved to
`render`** (**A64**), and in B3a out of `render` too, into a set of its own — the same rule firing
twice. `shots` is the newest set and the one to watch: five picture tools were 166 s, and T1b's
`avenue_shots` took it to 305 of 360.

**A frame at High** — and *which* frame is the whole of it, because two views of the same city
differ by a factor of two. `budget_gate`'s street-zoom night row is **289,446 triangles of
320,000** with eight baked street chunks; D5's `city 40t` night is **130,936**, which is exactly
what its day frame costs, because at that span the ladder has already dropped the chunks and the
night's lamps and lit windows live inside them. A chunk is 33.7k triangles and bakes in 9 ms on
the 4090 (13 on SwiftShader) against an 8 ms budget. A person is 42 triangles and a car 76.

**The city under it**: a build action costs **about 115 ms of derivation on the render thread** on a
played 96 — `createModel` 49.6 ms and `deriveNav` 64.5 beside it, which nothing had ever timed until
W3 (`tools/model_cost.mjs`). The worker took the month tick off that thread (3.6 ms) and left this,
which is Q60 standing where it has stood since R1 and is now W6: **one build action changes 0.07% of
the model** — 1 corridor of 1,402, 2 lanes of 8,896 — and the whole thing is rebuilt because ids are
array indices. The steepest street is 18.8% against a 15% limit on `rolling`, with no
corridor that grading cannot fix. On a 128 `hilly` it is **42.7% with 205 of 929 ungradeable corridors
and 4 cliffs**, down from 500% with 218 of 612 and 25 cliffs before J3 (era 22) stopped the deputy
paving up a 30% hillside — and that gate could not be run at all until S11 taught the fixture that a
network refuses rock. It is a tool rather than a gate: it was green at era 22 and red at era 23 with
no change to the rule, because its criteria are absolute and the hilly city moves with every balance
era (Q142). **Since A119 it is a gate again**, and green: a cliff on a corridor no grading can
flatten is counted as terrain and a lot the walker stands on top of is a building buried in the hill
(Q144), so what the criteria test is what is left over — which is nothing.

## What is missing, and known to be

**1 open question** is on the list (`dev-questions.md`, bottom section). The nine that were there
were all answered on 2026-10-03 (A113–A121) and are work in `plan-v1.md`'s order rather than
decisions waiting on anybody; the two that are left were both found by instruments those answers
built — Q145 (a street's embankment has no batter) by the hilly walk, and Q146 (a high street at
eye height with nobody on it, while two counters say 122 people are posed there) by F2's
storyboard — and Q146, which came out of the same storyboard, was answered by building B10 the same
day: every shop, works and civic building asked for nobody on its pavement, because the field the
crowd was reading holds residents. The other two came out of reviewing the multiplayer plan against
the seam W1 and W2 actually built — and Q147 (undo changes the city and is not a command) was
answered by building it in W4 the same day. Q148 (thirteen options the project declares and nothing reads) was
answered the same day by pinning the list in a test and deleting the one registration slot that had
no caller. What is left is Q145. What a reader should still know:

- **One real device has been measured, and no phone has.** `?perf=1` runs a nine-step frame sweep
  on whatever device the page is open on and ends with a **Copy** button; every card in
  `reports/perf/` is folded into `reports/perf/README.md`. The RTX 4090 card holds a flat 16.7 ms
  p50 across the whole sweep, and **finding that took four minutes to expose a defect eight months
  of software rendering could not**: the frame-time governor was giving up its entire quality
  ladder on any machine locked to its refresh rate, because each tier's target was the refresh
  interval rather than a threshold above it. Fixed, and the card taken after the fix has the
  governor **idle on seven of nine rows** — the before and after sit side by side in
  `reports/perf/README.md`. What is still missing is a phone: the tier budgets and the governor's
  trigger are both set against a machine that has never struggled
  (`workitems-measurement.md` D2, D3, D5).
- **The simulation is off the render thread** (W1, W2, 2026-10-04). `worker/sim-worker.js` owns the
  state; the page holds a mirror patched from the tile layers that changed, and
  `tools/worker_smoke.mjs` plays the same 46 commands and 200 ticks on both arms for the same
  hash. `?worker=0` keeps it on this thread, which is the fallback's lever and what a browser
  without `Worker` gets. **What has NOT moved is the expensive half**: the model rebuild of
  53.3 ms on 96×96 — 184.7 ms on 256×256 — is cityviewer's, it is on the render thread still, and
  it dwarfs the 4 ms tick that moved (Q60, D6). That measurement is W3, and it is the item that
  will say what the worker actually bought.
- **Multiplayer is started, headless.** `workitems-multiplayer.md` lays Wave 5 out against the seam
  that W1–W4 actually built, and A125 says what may be built before the playtest: the server's
  ground, the room half of the relay and the request commands in the engine. **Nothing a player can
  see** — no socket in the page, no lobby, no `?room=` — until Kjell has played the singleplayer
  game and said it is fun.
- **Multiplayer is not played.** Ruling 003 holds Wave 5 behind the singleplayer MVP being
  *accepted*, and acceptance is a playtest, not a green suite. The seam is built in — commands
  cross the wire, not state — and nothing has crossed it yet. The territory overlay has no
  control because it is a multiplayer view (Q61).
- **Norwegian is reviewed** (A21, closed 2026-09-08). Key parity is enforced by test and so is the
  harder question — no Norwegian string may be byte-identical to its English without a reason on a
  list — and the 414 strings have now been read by a Norwegian and passed with no corrections.
  `node tools/i18n_review.mjs` regenerates the table whenever a slice adds more.
- **Treasuries run away** — median 1.9M by year 25. Accepted with numbers rather than tuned away;
  the two attempts to fix it with upkeep both bankrupted weak cities without touching rich ones.
- Smaller ones, each with a note: the estimate's floor at the bottom of the LOD ladder (Q32), the
  two hidden faces of a building (Q39), how deep a cutting a junction may have now that one may move
  at all (Q134, which is what Q64 became when S11 answered it),
  and a night frame spending 93% of its budget on eight baked chunks at the close zoom (Q68).
  The water surface (Q66) and the chunk bake time (Q71) were closed by measurement on 2026-09-09.

## Where everything is

| File | What it is authoritative for |
|---|---|
| `specs/gamedesign.md` | what the game is |
| `specs/plan.md`, `specs/engine/` | how it is built; the renderer |
| `plan-v1.md`, `workitems-*.md` | what to do next |
| `specs/rulings/` | why a decision was made — 46 of them, one per file |
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
