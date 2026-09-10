# City Grid — what this is, at this commit

*Written for two readers: somebody about to play it, and somebody about to work on it. Every
other document in this repository says what the game is meant to be. This one says what was
measured when somebody last looked, which is a different claim and the only one you can check.*

- **Commit:** `782e759` on `dev_night`, the end of `workitems-measurement.md`'s buildable half —
  which is what the numbers below were measured at. **`main` is the release and `dev_night` carries
  what has landed since**: `main` was pushed on 2026-09-08 at `2f26532`, and every commit between
  is a document. Nothing on `dev_night` changes what this page claims until the next slice does,
  and the docs test prints the drift as a note rather than a failure for exactly that reason.
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

| Tier | Triangles | Frame target | Street chunks | Cars | People | Lamps | Post |
|---|---|---|---|---|---|---|---|
| Low | 40,000 | 40 ms | none | 60 | 0 | 0 | — |
| Medium | 140,000 | 40 ms | 4 | 200 | 40 | 5 | pixel |
| High | 320,000 | 20 ms | 9 | uncapped | 120 | 8 | pixel, ink |

The frame targets are thresholds with headroom, not refresh intervals: 20 ms is 60 fps with a fifth
of a frame of room, 40 ms is 30 fps with the same. They were the intervals themselves until D5,
which is what made the governor spend its whole ladder on a machine hitting 60 fps exactly.

**The gates**, all green, through the runner (`node tools/gates.mjs <set>`):

| Set | Gates | Time | What it is |
|---|---|---|---|
| `quick` | 12 | **459 s** | the ten browser smokes, the §24 acceptance script, `budget_gate` |
| `render` | 3 | **3 s** | `walkthrough`, `passability`, `lanes_dump` |
| `sim` | 3 | **595 s** | `disaster_soak`, `traffic_gate`, `sim_sweep` |

The slowest single gate is `budget_gate` at **152 s**, then `ui_smoke` at 100 and `a11y_smoke` at 45.
Each run writes `reports/gates-<date>.json`.

`quick` was 375 s when M2 measured it and set the budget as "the measurement plus room". It is now
**459 s of 480 — 96%** — and the growth is the measurement lane buying coverage: D1's perf-card
check added 26 s to `ui_smoke`, D8's desktop-viewport rows 49 s to `budget_gate`, and both catch
things no other gate can see. The budget is deliberately not raised (**Q79**): M2's rule is that a
gate which grows past its share is a finding, not a fact of life.

**A frame at High** — and *which* frame is the whole of it, because two views of the same city
differ by a factor of two. `budget_gate`'s street-zoom night row is **289,446 triangles of
320,000** with eight baked street chunks; D5's `city 40t` night is **130,936**, which is exactly
what its day frame costs, because at that span the ladder has already dropped the chunks and the
night's lamps and lit windows live inside them. A chunk is 33.7k triangles and bakes in 9 ms on
the 4090 (13 on SwiftShader) against an 8 ms budget. A person is 42 triangles and a car 76.

**The city under it**: the model rebuild after a build action is **53.3 ms on 96×96, 68.3 on a
128 `hilly`, and 184.7 ms on 256×256** — eleven frames on the largest map the lobby offers, on the
render thread (Q60, D6). The steepest street is 18.8% against a 15% limit on `rolling`, with 8
corridors of 773 that no grading can fix because their two junctions are further apart than that;
on a 128 `hilly` it is 59.3% and 459 of 1,392 (Q64, Q74).

## What is missing, and known to be

**23 open questions** are on the list (`dev-questions.md`, bottom section). Each names what it blocks and the
assumption the code was built against, so each is cheap to reverse. The ones a reader should know
about:

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
- **The simulation is on the render thread.** `specs/plan.md` §0 says "always a Web Worker" and
  `worker/` is empty. A model rebuild of 53.3 ms on 96×96 — 184.7 ms on 256×256 — sits beside a
  4 ms tick (Q60, D6).
- **Multiplayer is not started.** Ruling 003 holds Wave 5 behind the singleplayer MVP being
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
  two hidden faces of a building (Q39), whether a junction may move to keep a 15% grade (Q64),
  and a night frame spending 93% of its budget on eight baked chunks at the close zoom (Q68).
  The water surface (Q66) and the chunk bake time (Q71) were closed by measurement on 2026-09-09.

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
