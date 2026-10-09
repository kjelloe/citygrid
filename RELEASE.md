# City Grid — what this is, at this commit

*Written for two readers: somebody about to play it, and somebody about to work on it. Every
other document in this repository says what the game is meant to be. This one says what was
measured when somebody last looked, which is a different claim and the only one you can check.*

- **Commit:** `3d86c6e` on `dev_night`, after **a multiplayer room a player can host, join and
  play in** (X0 through X4e), **a sun that crosses the sky** (S22), the price of clearing ground and
  the quests the tools had never loaded (era 30), the model's dirty set, the request commands and
  borrowing — which is what the numbers below were measured at. **`main` is the release and
  `dev_night` carries what has landed since.** `main` was last pushed on 2026-10-05 at `6b89a6f`;
  this page named a commit **129 behind** until 2026-10-04, with every number on it measured against
  a game that no longer existed, so `test/docs.test.js` fails past fifty commits of drift rather
  than printing a note nobody reads (M7).
- **Date:** 2026-10-08
- **Balance era:** era 30 (`reports/balance-era30.md`), measured 2026-10-08 over 200 games per
  configuration, with **two arms beside it** (`balance-era30-arm-{bulldoze,quests}`) because two
  rules moved at once. Era 30 is L2's price for clearing ground — a bulldoze costs 5 before
  difficulty scaling, so **relaxed 3, steady 4, demanding 6**, where it was 0, 0 and 1 — and D8b's
  quests, which the tools had never loaded. Both are **economically invisible to the deputy's city**:
  population 1811 / 1710 / 1543 / 1572 against era 29's 1811 / 1710 / 1545 / 1572, and a treasury
  13,600 to 17,500 higher on four to five million, which is the quests' reward money. With disasters
  off the price changes **nothing at all** — the deputy only bulldozes to clear a ruin.
  **Before it, B14 changed what the deputy builds** — it refuses a street where one already runs
  within `deputy.blockTiles` of most of the run — so every number in the project moved and era 28's
  are void rather than roughly comparable. Median population 1,710 and treasury 3.95M on
  `steady-64`; the paved share of a played 64 falls from 31–40% to 19–34% and the side-by-side
  street pairs roughly halve, which is what the item was about. Numbers from an earlier era are void — and the frame
  numbers further down are renderer measurements, which belong to no balance era. This line said
  "era 1" until P91, five eras after the data stopped agreeing with it, because the doc test was
  pinning the words rather than reading `data/balance.json`.
- **310 commits**, one per slice, no squash and no merge commits. Twenty-two of them were
  reconstructed in one sitting from two days of uncommitted work, which is a thing this page records
  rather than hides: see `dev-log.md`, "The two days, committed".
- **1,978 tests**, green twice in a row on every slice (`./test.sh`), and **eleven gate sets** —
  `quick`, `render`, `lanes`, `budget`, `shots`, `transport`, `kits`, `sim`, `sweep`, `film` and
  `room` — every one of their budgets re-measured on a quiet machine at era 30 (M9), most of them
  downwards.

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
- **And the sun crosses the sky** (S22). It did not until 2026-10-08: the key light's x and z were
  constants, so every shadow in every city at every hour fell the same way and only their length
  changed. The azimuth now rides the same wall clock the four composed presets do, over a quarter of
  the sky, in steps small enough that the shadow texel grid holds still between them — and a moon
  takes the night on its own arc, half a turn away, so a night shade falls the other way.
  `tools/sun_shots.mjs` reads the light's position out of the page at three hours rather than
  judging by pixels: 125.7°, 146.3°, 166.9°.
- **The simulation is off the render thread.** `worker/sim-worker.js` owns the state and the page
  holds a mirror patched from the tile layers that changed; `tools/worker_smoke.mjs` plays the same
  46 commands and 200 ticks on both arms for the same hash, and `?worker=0` is the lever that
  forces the local one. Every change to the city is a command — undo included, since W4.
- **A multiplayer room a player can play in** (X0 through X4e, 2026-10-06/08 — A125 was lifted on
  2026-10-07 as A131). A player hosts from the new-game screen and sends somebody the address bar;
  the guest joins by a six-character code or watches without taking a seat. On screen: whose ground
  is whose, the territory overlay with a legend that names each seat, an inbox for the neighbour who
  asks to clear your road, a standing answer so the month can answer for you, a ping, chat, a
  roster, and a seat that is still yours for two minutes after you close the tab — then the deputy
  plays it, then the ground goes to the commons. A room nobody is in stops playing.
  `tools/room_smoke.mjs` drives **five browsers** through all of it on the real server;
  `tools/room_soak.mjs` plays **five city years with two real `ws` clients and ends on one hash**,
  checked every sim-month, and `room_churn` takes a seat away and gives it back over 5,586 frames
  with nobody diverging. A demolition request is state, a command and a hash; a room survives a
  restart.
- **A build action costs 28.6 ms** of derivation instead of 98.3 (W6a, W6b), and the city no longer
  blinks through it: every car, person, train, boat and aircraft keeps its place across a build
  (B11), because a derived thing's identity is its geometry rather than its index in an array.
- **And since `main` was pushed** (on `dev_night`, measured but not released): a road crosses water
  on a deck with clearance for a boat under it, the shore is a bank rather than a quay, a street's
  verges are green from the air, rain falls at street level, a railway cuts and embanks instead of
  following the ground, the deputy will seek a river crossing when its own bank runs out, a street
  that stands a storey above the water has a faced wall with a coping, there are people on the
  pavements outside shops and schools at last (every non-residential building asked for nobody until
  B10), the whole thing can be rendered as a sixty-second film from a shot list, an ambulance
  answers a sick block and the traffic pulls over for it, a storm throws lightning and a downpour
  floods a stretched water network, and a city in trouble can borrow against its rank and pay it
  back.

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

Measured 2026-10-08 at this commit, on SwiftShader, **one set at a time with nothing else
running** — a set measured beside another measures the machine, and three reds in one day were
exactly that, so the runner prints `NOT ALONE` when another node process is alive (M9). A gate time
is only comparable within an era.

| Set | Gates | Time | Budget | What it is |
|---|---|---|---|---|
| `quick` | 12 | **522 s** | 600 s | the eleven browser smokes and the §24 acceptance script |
| `render` | 3 | **6 s** | 60 s | the two walks and `passability` |
| `lanes` | 1 | **39 s** | 240 s | `lanes_dump` — 211 s at era 28; B14 shrank the hilly city under it |
| `budget` | 1 | **277 s** | 330 s | `budget_gate` — three tiers, two projections, four spans, two viewports |
| `shots` | 9 | **303 s** | 390 s | the world lane's picture gates, each counting what it photographed |
| `transport` | 4 | **268 s** | 330 s | T1–T4's pictures |
| `kits` | 6 | **395 s** | 480 s | one picture per catalogue definition, per kit, per role, per street |
| `film` | 1 | **116 s** | 180 s | the sixty-second storyboard, every frame counted for triangles and for life |
| `sim` | 2 | **354 s** | 450 s | `disaster_soak` and `traffic_gate` |
| `sweep` | 1 | **628 s** | 780 s | the 200-game balance sweep, which is the only gate that writes a report |
| `room` | 3 | **187 s** | 600→300 s | five browsers in one room, and two `ws` clients on one hash |

Every budget on that table was re-measured at era 30 and **most of them came down** — `kits` by
half, `film` to a third, `room` to a half. `sim` was split from `sweep` because one gate was two
thirds of the set, which is M2's rule for the fifth time. The slowest single gate is `sim_sweep` at
**628 s** (439 when it was first measured, and the growth is thirty balance eras of a bigger city,
not the code: timed with the quests off and on it is 587 s and 586 s). Then `budget_gate` 277,
`ui_smoke` 179 and `traffic_gate` 175. Each run writes `reports/gates-<date>.json`.

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

**The city under it**: a build action costs **28.6 ms of derivation on the render thread** (median of
twenty, best run 20.3) on a played 96, down from 98.3 ms warm this morning — a door search that
compared every lot against every pavement, a `heightAt` that walked every node in the network per
call, junction boxes recomputed for all 1,402 junctions, and finally the dirty set itself, which
reuses **1,401 corridors of 1,402 and 7,611 nav edges of 7,678**. The older figure of 115 ms is void: it was `createModel` timed on its first run in the process
beside a nav graph nothing had warmed. A build no longer resets the city's traffic either (B11).
What is left (W6c) is not an algorithm: both graphs still allocate 8,896 link objects and 7,678 edge
records every time, because ids are array indices, and garbage collection is 5 ms of the 28. Previously measured as
`createModel` 49.6 ms and `deriveNav` 64.5 beside it, which nothing had ever timed until
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

**5 open questions** are on the list (`dev-questions.md`, bottom section), none blocking anything —
each one is a picture, a rung or an improbability that a slice measured and handed back rather than
choosing for itself.

- **Q165**: a new room's code is refused if a live room holds it and not if a hibernated one does,
  because asking the disk would make the door asynchronous. Two in a million with 64 rooms held,
  and the cost is one sleeping city left unreachable until `prune`. Guard it, or leave it written
  down where it is?
- **Q161**: a junction laid mid-street deletes the pavement somebody was standing on, and the
  geometric re-seat moves them up to 6.2 m. Keep their side of the street, walk them out, or leave
  it and write down that two people in four hundred moving once per build is below what anybody can
  see? (W6d, one function.)
- **Q162**: the wall's rung was chosen from a ladder of 264 faced shoulders against 130, and those
  are **era 28's** numbers — B14 paves a fifth of the city instead of a third, so a hilly 128 now
  reads 24 / 5 / 2 at 1.2 / 2 / 3 m. Is two metres still the rung?
- **Q163**: `building-kit.js` and `detail-kit.js` push nine faces each with a COMPASS shade, which
  is a sun direction frozen into every roof and prop — 18.3% of spread on `plain`, 40% on `pixel`,
  against the 5.6% S22 removed from the slab. Do the lit styles give theirs up? It is a restyle
  rather than a slice, and the pixel style is unlit, so for it the bake IS the light.
- **Q164**: the sun crosses the sky now and reads quietly at midday, because the key light stands
  at **83.4°** of elevation at noon (62.4° at dusk, where it reads well). Stand it further out so
  the shadows lengthen?

The seven the week raised were answered on 2026-10-08 as **A132–A138** (P111), and what each one
left behind is work rather than a question:

- **Q154 → A132: the wall at two metres. Built 2026-10-08 as `slice-S18c`** — and the ladder it was
  chosen from is **void**. A132 picked 2 m over 3 m on 264 faced shoulders against 130; those are
  era 28's numbers, reproduced at B14's parent commit, and era 29's city reads **24 / 5 / 2** at
  1.2 / 2 / 3 m on a hilly 128 and **17 / 4 / 3** on a rolling 96. B14 paves a fifth of the city
  instead of a third, so the parallel streets on a hillside that made the shoulders are gone; on
  gentle ground the few that are left run closer to the water, so a rolling 96 went from none to
  three. The direction holds and 2 m is shipped; whether it is still the right rung is **Q162**.
  Both instruments print the ladder every run now.
- **Q155 → A133: clearing ground costs five.** A bulldoze cost **nothing** at two of the three
  difficulties, because the price was 1 and `idiv(1 × 90, 100)` is 0. Five, not the floor of one —
  so it is a balance era with a sweep and a report, and **D8b** (A136) folds into the same one:
  `tools/` will load `data/quests/`, with three arms (null, bulldoze 5, quests alone) and one
  fixture re-pin naming both. **L2.**
- **Q156 → A134: the stall stays, and W6c is held.** A build action costs 28.6 ms of derivation
  against a 16.7 ms frame, and the rest is allocation rather than algorithm. Held until the room is
  played and the hitch is felt, or a client's frame p95 in `room_smoke` crosses 33 ms during a build
  burst — the first change where the renderer, the traffic, the crowd and the gates would have to
  agree about one structure's identity at once.
- **Q157 → A135: the deputy keeps three tiles between its streets.** Era 29 bought 7% more people
  (1,602 → 1,710 on the steady-64 sweep) with a quarter less road, and the price is homes with no
  frontage: 4 a city → 14 of about 250. `deputy.blockTiles` stays at 3, and the cost is recorded in
  `reports/balance-era29.md` rather than tuned away.
- **Q158 → A136: quests go into the tools, at the next era.** Every measured number in this file is
  a city with **no quests in it** — nothing in `tools/` loads the catalogue, so `soak`, the balance
  sweep and the fixtures run a city where no quest can fire while a browser has 21 of them. Found in
  X1c, when two browsers and a room came out on three different hashes at one tick for the same
  reason on the server's side. Folded into L2's era above.
- **Q159 → A137: the classic skin stays as built.** `clean`, `retro` and `dark` have been in the
  settings panel since N24, `a11y_smoke` proves each one repaints, and `tools/skin_shots.mjs` takes
  all three on one city (`reports/skin-{clean,retro,dark}.png`). M10 is closed.
- **Q160 → A138: the sun crosses a quarter of the sky, at a rate in the data.** The key light's x
  and z are constants, so it rises and falls on one azimuth and every shadow in every city falls the
  same way at every hour. `sun.arcDegrees` and `sun.moonArcDegrees` go into `data/cityviewer.json`
  with the mirror, the moon gets an arc of its own, the presets are untouched, and the baked face
  tints give up to the real light. **S22** has the analysis and the gates.

Everything else on this list has been answered and built; the seven above replaced nine answered on
2026-10-03 (A113–A121) and four more on 2026-10-04 (A125–A130). What a reader should still know:

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
  said what the worker actually bought. **Answered since**: W6a gave every derived thing an identity
  made of geometry, W6b made the rebuild a dirty set — 1,401 corridors of 1,402 and 7,611 nav edges
  of 7,678 reused — and a build action is **28.6 ms**, down from a warm 98.3. What is left is W6c:
  the last 28 ms is allocation rather than algorithm, because both graphs still build 8,896 link
  objects every time.
- **Multiplayer is built and has never been PLAYED.** Twenty of Wave 5's twenty-two items are
  done, and what is left is two: `splitRule`, `mutualAid` and `disasterAid`, which change what a
  city earns and are therefore a balance era; and the lobby's remaining rows (the QR code, ready,
  joining a room that has started). Since 2026-10-09 a room hibernates to the disk and wakes when
  somebody types its code (X4f), the city keeps a history that outlives the alert list (X4h), and
  the host holds the clock and the door (X2d). The gap is not code — it is that **five browsers on
  one machine driven by a gate is not eight people on an evening**, and the release gate for the
  wave says eight clients for an hour with a desync count of zero. That evening is Kjell's.
  Ruling 003 is unmoved either way: singleplayer opens no socket and `offline_smoke` asserts it.
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
