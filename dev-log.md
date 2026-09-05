# City Grid — development log

*The real history of the project, newest last. Every slice gets an entry naming what was
**measured**, not what was intended, and every dead end is written down with its measurement so it
is never re-walked. Planning entries are here too — the reasoning behind a plan rots faster than
the plan itself.*

---

## 2026-08-25 — Planning: the singleplayer plan (P1)

Read `specs/gamedesign.md` (a complete singleplayer design), `specs/referencedata.md` (a
behavioural analysis of a classic open-source city simulator), and the two stack write-ups in
`../Retrogradegames/`.

Wrote `specs/plan.md` rev 1. The load-bearing decisions: a pure deterministic reducer with integer
state and the PRNG inside the state; no build step; three.js with instanced meshes; state hash as
the single contract; numbers in JSON, never in code.

Two things in `referencedata.md` were deliberately **not** ported:

- Its traffic router is a 30-step random walk with an undefined-variable bug; route-finding is
  effectively broken. Replaced by a monthly capacity-aware integer Dijkstra over sampled
  origin–destination pairs.
- Its constants were tuned for a 120×100 map, a different demand model and no multiplayer. They
  enter as `era 0, untuned` starting points only (later ruled: 007).

Licence posture set: `referencedata.md` is a specification to compare against, never a source.
City Grid ships MIT.

## 2026-08-25 — Planning: multiplayer (P2)

Requirements arrived: fully client-side singleplayer, a lobby, drop-in for up to sixteen players,
**no direct destruction of another player's work**, an optional exclusive-sector mode, several
modes.

Rev 2 of `specs/plan.md`. The decision that shaped everything after it: **ownership is hashed
engine state and permission checks live in the reducer**, not the UI. A tile carries an `owner`,
and `engine/permissions.js` gates every command. Retrofitting that later is how permission bugs are
born, so it moves into the first placement slice (1.3) rather than a multiplayer wave.

Demolition became a request entity in game state — title, location, reason, optional compensation,
standing policy for absent players — rather than a chat message, so it replays and so an absent
player answers deterministically.

## 2026-08-25 — Planning: server load (P3)

Question was whether to use "the 20 Hz approach" from `../Fireline`.

**Measured, from the source:** Fireline is **10 Hz** — `engine/clock.js`, `TICKS_PER_SECOND = 10`,
`TICK_MS = 100`. Its profile (`reports/2026-08-06_resource_profile.md`) shows the per-player cost
is per-socket snapshot serialization, ~0.35% of a core and ~0.5–1 MB RSS each, and that views are
built per team specifically to hold that down.

Conclusion: adopt the cadence and its instrumentation, **not the payload**. Fireline streams
snapshots because dozens of units move every tick and clients interpolate. City Grid has no
authoritative motion — its vehicles are a sampled representation of traffic density, which every
client can generate locally — so frames carry accepted commands, one serialization per pump serves
every socket, and server cost is flat in player count. The inverse of Fireline's scaling.

The load levers that actually matter turned out not to be the tick rate: coalescing drag-paint into
one RLE command (the reference implementation fires a tool event per tile crossed — *that* would
be the overload), degrading the game clock rather than the pump, and hibernating empty rooms.

## 2026-08-25 — Planning: omission review (P4)

Reviewed rev 2 against the design and both reference stacks. Ten gaps, five needing a decision
before code. The two worst were structural:

- **The multiplayer simulation had no semantics.** Ownership was specified in detail but nothing
  said what RCI demand *is* with sixteen players — the core loop. Ruled at 001.
- **No session lifecycle.** Drop-in only makes sense if the world outlives the session, but nothing
  said whether a room ends. Ruled at 002.

Also added: protocol versioning against a cached PWA (after every deploy the *default* case is a
stale client meeting a new server, and a mismatched reducer desyncs silently), a disasters slice,
audio, accessibility, drop-in onboarding, moderation, ops, command-log growth, chaos injection, and
the rule that perf is measured on a saturated city rather than an empty map.

## 2026-08-25 — Planning: design updated, plan-v1 written (P5)

Four rulings taken (001–004). `specs/gamedesign.md` rev 2 adds §25–33 — multiplayer, modes and
lobby, session lifecycle, progression, difficulty, communication, audio, accessibility, onboarding,
content — plus a §33 amendments table so the original design stays readable rather than rewritten
underneath.

`plan-v1.md` written: 7 waves, 27 slices, three release gates, a stop-and-re-plan section.

## 2026-08-25 — Planning: balance provenance and art style (P6)

Rulings 007 (start from reference constants, tune by sweep) and 005/006 (one art style at v1,
chosen by probe; four-angle rotation is a hard requirement).

The useful finding: the three candidate styles are **two pipelines, not three** — pixel art and
isometric 2.5D are the same depth-sorted sprite code at different resolutions. With rotation as a
hard requirement, a drawn-sprite style would need four sprite sets per building state, so v1 is the
mesh pipeline. The pixel-art *look* survives inside it as a post-process — low-resolution render
target, nearest upscale, palette quantisation, dither, outline — keeping rotation, zoom and
procedural asset generation. Slice 1.2b rewritten around three rotation-capable candidates.

## 2026-08-25 — Records and scaffold (P7, and this entry)

`dev-prompts.md` and `dev-questions.md` created — prompts verbatim, questions with their answers,
open questions in a clearly separated bottom section.

Then the project scaffold: `README.md`, `CLAUDE.md`, `dev-log.md`, `specs/art-direction.md`
(framework only — the style itself is blocked on probe 1.2b), `specs/rulings/001–007`, four skills,
and a runnable test harness.

**The harness is the point of this entry.** `./test.sh` runs `node --test` twice and is green
against an empty codebase, and three of its tests are already load-bearing before any engine code
exists:

- `subset.test.js` fails on a `class`, `this`, `Map`, `Set` or `throw` in `engine/` (ruling 004).
- `purity.test.js` fails on `Math.random`, `Date.now`, `new Date`, `setTimeout`, `null` literals or
  float literals in `engine/` and `shared/`.
- `docs.test.js` fails when the open questions in `plan-v1.md` and `dev-questions.md` disagree,
  when a referenced document is missing, when a ruling lacks its required fields, or when
  `dev-prompts.md` has a gap in its numbering.

They pass vacuously today and start biting on the first line of slice 0.2. Writing the guard
before the code is cheaper than retrofitting it after — which is the same lesson as ownership
landing in slice 1.3.

**Next:** slice 0.1 (repo skeleton and static serve) and 0.2 (deterministic primitives with pinned
vectors).

## 2026-08-25/26 — Autonomous build session: Waves 0 and 1 (P8)

Eight slices, 218 tests, suite green twice at every commit. Engine-first, so
1.2 (renderer) and 1.2b (style probe) are deliberately **not** done — the probe
exists to be judged by eye and waits for the user, and ordering principle 1
says engine before client anyway.

**0.1 repo skeleton** — no-build ESM client, importmap, static server, i18n
from the first string (ruling 008) with `en`/`no` key parity enforced by test.
Switched from bare specifiers to relative imports: `shared/prng.js` will not
resolve in Node without a loader, and relative paths work unchanged in both
Node and the browser, which is worth more than tidy-looking imports.

**0.2 primitives** — xorshift32 with its state in state, rejection sampling in
`nextInt` (modulo bias is small but *deterministic*, which makes it a permanent
thumb on the scale of every map ever generated), integer/fixed-point maths,
grid helpers with RLE, canonical little-endian writers, FNV-1a 64 in two 32-bit
lanes.

*Measured:* three pinned vectors I authored by hand were wrong. FNV's three
published vectors passed, which is what proved the lane arithmetic; the ones I
invented did not. **Never author a pin — compute it.**

`shared/arrays.js` exists because the subset guard refuses `new` in `engine/`.
Allocation moved to the adapter layer, which is where a Luau twin would want it
anyway. The guard produced a better design than the design would have.

**0.3 / 0.4 state, reducer, chaos** — SoA with `owner` and `district` present
from the first allocation. `hashState` walks an explicit ordered field list,
and a test varies every option and every tile layer to prove each reaches the
hash.

`apply()` mutates and returns a result envelope rather than copying. The
pure-copy version was rejected against the cadence: ~300 KB per copy at sixteen
fast ticks a second is 5 MB/s of memcpy for nothing, and placement already gets
all-or-nothing from the staging buffer.

*Three bugs, all found by tests before any gameplay existed:*
- **JOIN could never succeed.** `apply()` required the actor to exist, but JOIN
  is what creates the actor. Found by the first seat test.
- **`{type:"constructor"}` was called as a handler.** `HANDLERS[command.type]`
  resolved through the prototype chain. Found by `tools/chaos.mjs` on its
  first run, which is exactly what it is for.
- **`{status: undefined}` passed a range check** — `undefined < 0` and
  `undefined > 3` are both false — and landed in hashed state. Chaos again.

**1.1 terrain and districts** — integer value-noise elevation, river carving
that follows valleys, lakes/coast/archipelago, shoreline and beaches, forest by
random walk. Districts partition by capacity-constrained growth and pass a
fairness gate or the seed is re-rolled.

*Measured, 200 regions per size, all five water styles:*

| size / seats | accepted | spread median | p50 gen |
|---|---|---|---|
| 48×48 / 4 | 93% | 95% | 0.74 ms |
| 64×64 / 8 | 94% | 80% | 1.31 ms |
| 96×96 / 12 | 93% | 72% | 2.98 ms |
| 128×128 / 16 | 93% | 69% | 5.97 ms |

*Three findings, all from the sweep rather than review:*
- **Distance-based growth was rejected by its own gate on 81% of regions.**
  When a river cuts the map, whoever starts on the larger side simply gets
  more, and no threshold fixes that. Quota-driven growth took median spread
  from 49% to 80%. This is the clearest case so far for "five seeds tell you a
  system fires; a battery tells you what is fair".
- **Seeds were claimed during init**, so `step()` skipped them as already-owned
  and never expanded. Every district was exactly one tile. Invisible to the
  fairness gate, which happily reported that one-tile districts were unequal.
- **Per-district surface water was a hard gate** and refused 116 of 200
  perfectly playable regions. Groundwater pumps work anywhere
  (`gamedesign.md` §7.5), so it is a reported metric now. A hard gate that
  rejects most valid input is not a gate, it is a bug with good intentions.

**1.3 roads and the permission gate** — one staging buffer for every placement:
stage, price the whole edit, commit all or none. A 400-tile drag is one RLE
command. Auto-connect keeps a 4-neighbour mask in the tile and reshapes
neighbours after every change, so a corner becomes a corner when the next tile
arrives.

Ownership is created at placement. The permission matrix test asserts every
command against every ownership relation, and asserts the invariant directly:
**no command ever mutates a tile the actor does not own.**

**1.4 zoning, demand, development** — ruling 001 implemented: one regional pool
that lots draw from by attractiveness. Same code at one seat and at sixteen.

*Three era-0 calibration faults, all found by the soak:*
- **Zoning was priced per tile at the reference's per-3×3-zone price** — nine
  times too dear. 20,000 bought ten blocks.
- **Growth was unreachable.** Base land value 60 against a neutral of 100 put
  every lot 32 points below the threshold. Nothing ever grew, and the soak
  reported a perfectly healthy run of empty cities.
- **Vacancy suppression at full weight counted buildings still filling up** and
  strangled every city at ~450 residents.

Demand also needed the lag the design already asked for (§9.3); without it the
pool slammed between its caps every month.

*Gate:* 5 pinned seeds, 20 years, all self-sustaining. Then — because picking
parameters on the gate's own seeds is the overfitting the discipline warns
about — validated on **20 seeds it was not tuned against: 20/20 above 500
residents, min 547, median 756.** Real balance tuning stays deferred to the
Wave 3 sweep (ruling 007).

**1.5 saves** — run-length encoded layers. Measured: 48×48 13.5 KB, 64×64
22 KB, 96×96 48.5 KB, 128×128 83.2 KB, which keeps yearly checkpoints
affordable for a persistent room. Every save carries its own hash and is
refused if it does not match. The strongest test is not that a save loads but
that the *future* is the same afterwards.

**Known and deferred:** cities plateau around 40 years because the deputy
spends down to its reserve and there is no tax income yet — that is slice 2.3.
`specs/asset-list.md` is hand-authored until `tools/asset_report.mjs` can
generate it from real catalogues.

**Next:** 1.2 renderer bootstrap and the 1.2b style probe (needs the user's
eye), then Wave 2 — power, water, economy, services.

## 2026-08-26 — Wave 2 part one: power, water, economy (P8, same session)

Slices 2.1, 2.2 and 2.3. Suite 250 tests, green twice. Power and water are one
implementation, because they are one problem.

**The design decision that mattered:** development now depends on supply
(`gamedesign.md` §8.2). Nothing is built where nothing can be supplied, and a
lot that loses its supply decays. That turns utilities from decoration into the
teaching loop the design describes — zone, watch it develop, watch it fail,
connect it — and it invalidated half the Wave-1 test fixtures, which had been
building cities with no power. They now build supplied cities, which is what
the game asks of a player.

**Five bugs, each found by the soak rather than by review:**

1. **The development pass demolished placed buildings.** A power plant has no
   zone, so it scored as an abandoned lot and the unsupplied penalty finished
   it off. Ten plants built, ten torn down the following month, capacity
   permanently zero. Invisible in the unit tests because nothing there placed a
   plant and then waited a year.
2. **The deputy built a power station before its first house** — 34 of them —
   because `demand + margin > capacity` is true when both are zero.
3. **It then built plants before it had a cursor**, so the connecting wire ran
   toward coordinate −1 and never landed.
4. **`supplyPass` counted only connected consumers**, so demand read zero and
   nothing ever decided a plant was needed. An unconnected consumer is unmet
   demand, not absent demand.
5. **A component with no producer has no demand**, so `capacity >= demand`
   marked every stretch of unconnected wire as powered.

**The one that took real measurement.** After all five were fixed, only 7 of 20
unseen seeds reached 500 residents; the median city had 54 people. The obvious
reading was cost — a plant, a pump and utilities on every road tile, all before
income exists. Three cost variants were measured and moved the median from 54
to 74. That is the signature of a wrong diagnosis: the intervention barely
moves the number.

The actual cause was **connectivity**. The deputy laid utilities along each
block without joining the blocks, so the map filled with separate networks that
had no power station on any of them. Giving it a grid hub that every block
connects back to:

| | median pop | ≥500 | median net |
|---|---|---|---|
| before | 54 | 7/20 | −489 |
| after | 1148 | 16/20 | +7596 |

**Then the honest bit.** The two cost changes had been made while chasing the
wrong cause, so they were re-tested afterwards rather than kept. Reverting them
gave median 649 and a median *deficit* of −304 — the median city slowly dying.
Keeping them gave a city too rich. The rule that survived is a principled one
rather than a tuned one: wire and pipe cost to build but not to maintain,
because distribution is maintained as part of the street it follows — one
street, one bill. That per-tile charge was invented here and is not in the
reference.

Final, 20 seeds not used for tuning, 20 years: pop p25 566, median 870, p75
3018; 16/20 above 500; net median +4891.

**Known and deferred to the Wave 3 sweep (ruling 007):** treasuries reach eight
figures by year 40, and industrial demand runs away on some seeds — one city
finished with 3959 jobs against 442 residents. Both are balance rather than
mechanism, and tuning them against 20 seeds now would be precisely the
overfitting the discipline forbids. They are written down here so the sweep
knows what to look for.

**Next:** 2.4 service coverage, 2.5 pollution and land value, 2.6 fire — then
the renderer and the style probe, which need the user's eye.

## 2026-08-26 — Wave 2 complete: coverage, pollution, crime, health, land value, fire

Slices 2.4, 2.5 and 2.6. Suite 270 tests, green twice. **Waves 0, 1 and 2 are
now done except the renderer and the style probe**, which wait for the user.

**Systems now declare an explicit order** rather than inheriting import order:
civic(10), utilities(20), development(30), ignition(35), economy(40). Before
this, development ran *before* utilities purely because of which file the soak
driver imported first — an ordering that would have broken the day someone
tidied the imports.

The five civic systems are one pass because they feed each other in a fixed
order. Splitting them would mean deciding, every month, which of them is
allowed to be a month stale. As it is, only one thing is: crime reads last
month's land value, because land value is what everything else depends on and
so it is the one kept current.

**Three bugs, all in the deputy's grid-building, all found by probing the
supply flags rather than by reading the code.** They are worth recording
together because they are the same mistake made three ways — assuming a plan
survives contact with a built city.

1. `connectToHub` **skipped blocked cells and kept walking**, punching a hole
   through the carrier line. A line with a hole is not a line; it splits the
   network in two. Power survived by luck because every street carries some;
   water did not.
2. Refusing any route with a building on it then failed the opposite way — in a
   city dense enough to matter, *every* route has one. Pumps sat at the river
   with **1 connected pipe tile out of 1206** while the whole city went
   thirsty. It is a breadth-first search around the obstacles now, which is
   what a person does with the tool.
3. Alternating between power and water left a city with **one power station and
   four pumps**: whichever was short while the other was fine simply never came
   up. They are handled independently in the same turn now.

The diagnostic that found all three was two lines — count carrier tiles, count
how many of them carry the supplied flag. `wire 757/807 powered, pipe 50/807
watered` said everything the code review had missed.

**One calibration fault the tests caught:** an uncovered fire had a 26% chance
to go out against a 12% chance to do damage, so nothing ever burned down and a
fire station bought nothing measurable. The test asked for the *direction* —
covered cities suffer fewer ignitions than uncovered ones — which is the kind
of assertion that survives a balance era.

Measured, 20 seeds not used for tuning, 20 years: pop p25 594, median 944, p75
2156; **19/20 above 500**; 34 fires across the twenty cities; crime median 17.

**Still deferred to the Wave 3 sweep:** runaway treasuries and runaway
industrial demand, both from the previous entry, both untouched. Pollution
averages read 0 on most maps because the average is over the whole region
rather than the developed part — true to the reference, but it will need a
developed-land average before it can drive anything.

**Next:** 1.2 and 1.2b, then Wave 3 — events and disasters, traffic, maturity,
and the first real balance sweep, which is where all of the above gets settled
with 200+ games instead of 20.

## 2026-08-27 — Review round

The periodic docs/specs/skills/memories/tests checkpoint. What had drifted:

**Every tool the skills referenced had a different name from the tool that
exists.** `sim-gate` pointed at `tools/sim_soak.mjs`, `tools/sim_sweep.mjs` and
`debugging/dbg_systems.mjs`; the repo has `tools/soak.mjs`,
`tools/mapsweep.mjs` and `tools/chaos.mjs`, and the census did not exist at
all. A skill that names a command nobody can run is worse than no skill,
because it is followed confidently.

**So the event census got written** — and immediately earned its place twice
over:

1. Its own first reading was wrong. `built`, `zoned` and `placed` showed as
   never fired in a city visibly full of roads, because the probe watched only
   the tick and the deputy's commands go through `apply` directly. *Verify the
   instrument before believing the reading* — the rule was in the skill file
   already, and I still had to be caught by it. The deputy now takes an
   optional sink so a probe can see what it actually did.
2. Once honest, it reported **11,899 developments against 11,810 abandonments**
   over forty years. The city was building and demolishing the same street
   forever. No test noticed: the invariants held, the population was fine, and
   the soak was green throughout.

**The churn, and two wrong turns fixing it.** First attempt was a `condition`
field — buildings survive several bad months rather than one. It made things
*worse* (28,604 / 27,852), because per-building inertia does nothing about a
population-level oscillation: everything developed together, vacancy spiked
together, demand crashed together, everything died together.

The actual fix is the reference's: **assess a quarter of the map each month,
rotating**, so the city stops moving as one body. Plus new buildings opening
half-occupied rather than empty, since a building that was built *because*
demand existed should not itself crash that demand. Churn fell to 4,261 /
3,969, and population improved as a side effect — 20 seeds not used for tuning
went from 19/20 above 500 to **20/20, median 1560**.

The condition field stayed. It is right for a different reason: it gives the
player time to notice a district failing before it empties.

**The five-places rule caught itself.** `scanCursor` is new hashed state; I
updated `createState`, `copyState` and `writeState` and forgot `toSave`. The
save round-trip test failed immediately, which is exactly what it is for.

**Also updated:** rulings 015 (the reducer mutates; snapshots are the caller's
job) and 016 (nothing develops where nothing can be supplied) — both were
decisions taken in code with only a comment to show for it.
`specs/gamedesign.md` gained §34 "As built", ten refinements the implementation
decided and the design had not, so the two do not quietly diverge.
`specs/plan.md` §3.8 now carries measured numbers where measurements exist.
The permission matrix grew rows for zoning and placement, plus a test that
fails when a registered command has no permission assertion at all.

## 2026-08-27 — Slice 1.2: the renderer, and the probe images

three.js r169 vendored and pinned. Chunked terrain with dirty-rebuild,
instanced networks and buildings, orthographic camera with four snapped yaw
angles, tile picking by ray-plane maths, and the `RenderStyle` seam carrying
each style's camera constraints. **A city of 236 buildings renders in 24 draw
calls** — the entire reason instancing is there.

Headless screenshots through Playwright and SwiftShader, which is correctness
only: frame times from a software rasteriser mean nothing, and real numbers
need a native run. `tools/client_smoke.mjs` is the gate — page errors, zero
draw calls, a fixture city that grew nothing, or draw calls climbing past 60,
which would mean instancing had quietly stopped working.

**Four rendering bugs, none of them visible to any existing test.** All four
were found by looking at the picture, which is the entire argument for having a
screenshot harness at all.

1. **The ground faced downward.** Quads wound clockwise seen from +Y, so the
   normal pointed at -Y and the whole terrain was backface-culled. The first
   screenshot was a city of roads and buildings floating on an empty sky, and
   every number in the report — chunks rebuilt, vertex counts, draw calls —
   was correct.
2. **Seams.** Each tile drawn at its own flat height left a vertical gap
   wherever two neighbours differed, so the map rendered with thin horizontal
   stripes of sky. Corners are shared now: continuous surface, per-tile colour.
3. **Pipes were above ground.** They are underground (`gamedesign.md` §7.5) and
   now appear only in the underground view.
4. **Every post-processed style was a third too dark.** A render target holds
   LINEAR colour and the pass-through shader wrote it straight to a canvas that
   expects sRGB.

The fourth is the one worth remembering, because it looks exactly like a
lighting bug and I spent two iterations tuning the outline and the palette
before measuring. **Measured: a post-process with no effect whatsoever —
no quantisation, no outline, no dither — dropped mean image brightness from 78
to 25.** That is not a look, that is a missing conversion. Setting
`texture.colorSpace` on the target did not take; the shader encodes explicitly
now, and pass-through matches plain at 78 exactly.

**The probe (1.2b) is rendered and waiting on a decision.** Same city, same
seed, same camera, three candidates in `reports/probe-close-*.png`. Two
findings for whoever judges them:

- The pixel candidate needs **divisor 2, not 4**. At 4 a whole building fits
  inside one pixel, the edge test fires on nearly every pixel, and the image
  turns to mud regardless of palette.
- It also implies a **closer default camera**. A whole 64×64 region at pixel
  resolution has features smaller than a pixel; the reference screenshot Kjell
  supplied is framed on a few blocks, and that is not a coincidence.

The claim from ruling 006 holds: the pixel-art look survives inside the mesh
pipeline, with four-angle rotation and continuous-ish zoom intact.

## 2026-08-28 — Detail pass: making three styles actually three

Kjell's two corrections, both right, and the second exposed the first.

**"All three samples looked like low poly."** They were: one set of boxes with
a different screen filter over each. A post-process is a finish, not a style.
Checking it properly also turned up a real bug — `painted` buildings were
rendering as **shredded triangles**, because the geometry merge dropped the
index buffer and `BoxGeometry` is indexed. The same indexing shared corner
vertices between faces, which blended per-face shading into gradients and
quietly weakened it everywhere, including in `plain`.

**"Add many vertices, each building needs to be distinct."** With the
transport-world reference attached, which is a much richer target than what I
had built.

So a style now owns four things and each of them differs: geometry, shading,
palette, finish — in that order of importance, with the post-process last.

`building-kit.js` builds real shapes: pitched, L-shaped and hipped roofs,
parapets, setbacks, sawtooth factory roofs, chimney stacks, porches on posts,
dormers. `detail-kit.js` covers them: framed window grids with sills, doors
with steps and lintels, balcony rails, air conditioners, water tanks, roof
hatches, vent pipes, shop signs, awnings, garden and yard fences. Street level
gained parked cars in six colours, lamp posts, and grass tufts and flowers on
open ground.

**Almost all the detail is flat quads held proud of the wall, not boxes.** A
window box costs twelve triangles and a window quad costs two, and at this
camera they are indistinguishable. That single decision is what makes a city
of detailed buildings affordable at all.

Four variants per category, picked from the building's id, plus per-building
height, colour and quarter-turn rotation. **None of it touches game state** —
shape, spin, colour jitter, tree species and car colour all derive from ids, so
two clients agree without any of it being saved, replayed or hashed.

**Corrections made while iterating, each caught by looking at the render:**

- Roofs took the wall colour, so a cream house got a cream roof and the whole
  building read as one lump. Roofing is dark whatever the walls are.
- Full-cell windows read as a dark grid — the wall disappeared and the building
  became a bookcase. Windows sit inside a frame now.
- A power pole on every tile is a picket fence down every street. Every third
  tile, thinner and darker.
- Trees grew on roads.
- `pixel` roads were near-black: unlit means the colour *is* the colour, and
  what looks mid-grey under a light renders black without one.
- **`painted` was an outline post-process, and an outline fights detailed
  geometry.** With windows, sills and roof clutter, every edge fires the edge
  test; the image turned to mud and read as dusk rather than as illustration.
  It is a lighting and palette treatment now — low warm sun, deep cool shadow,
  no post-process at all — which is what separates an illustration from a
  photograph anyway.

**The cost, measured rather than assumed.** A 187-building city is now **201k
triangles in 44 draw calls**; reduced effects brings it to 101k. Draw calls are
fine — instancing is doing its job — but `plan.md` §6's 80k triangle budget was
written when a building was a box, and a building is no longer a box.

The budget is not wrong. The answer is LOD: distant buildings do not need
window sills, and a tile at the far edge of a 128×128 region does not need a
tree with a trunk. **Level of detail by camera distance moves from "later" to
required**, and slice 6.3 settles the numbers on real hardware rather than on
SwiftShader, where frame times mean nothing.

## 2026-08-28 — Review round: the two tests that were documented but missing

Both were referenced in comments and specs as if they existed.

**The constants mirror had no test.** `client/constants-mirror.js` says in its
own header that "test/render.test.js keeps the two in step", and there was no
such file. A drifted constant draws the wrong thing and nothing complains.
Written now, along with a check that the mirror covers what the renderer
actually reads.

**The colour-vision check had no test either**, despite `gamedesign.md` §30
promising the palette is "verified against simulated colour-vision deficiency
in a test rather than by eye". Written, and it **failed immediately: seven
pairs of player colours collapsed**, the worst at a separation of 0.018 —
colours that are simply the same colour to a large number of people. Exactly
what picking by eye cannot catch, because the person picking has the vision
they have.

Rather than guess again, I searched: candidates across hue, saturation and
lightness, sixteen selected by greedy farthest-point search scored on the
**worst** pair across normal, protan, deutan and tritan vision at once. The
first run maximised separation and produced a garish set; constraining
saturation and lightness to a band that suits the game gave a worst pair of
**0.18 — ten times the failure threshold** — while staying cosy. Lightness
does most of the work, because lightness is the axis every deficiency
preserves. Ruling 018.

Also: `tools/style-sheet.mjs` renders all three candidates from one city, one
seed, one camera and stitches them into a labelled sheet with metrics
(`reports/style-sheet.png`). Three separate files are three separate
impressions; a decision needs them side by side, which is what a probe is for.

Rulings 017 (a style is geometry, shading and palette — the filter is last) and
018 written. `gamedesign.md` §34 gained six rendering entries.
`specs/art-direction.md` §2.1 records what the probe produced, including the
findings that outlive whichever style is chosen. The `sim-gate` skill gained
the three render instruments and one sentence that had to be learned: anything
visual ends with a screenshot **that you then look at** — four rendering bugs
in slice 1.2 were invisible to every test and obvious in the picture.

Suite 283 tests, green twice.

## N1 — level of detail with a configurable triangle budget

`setBudget(triangles)`, default 80,000. The policy that spends it lives in
`client/render/lod.js`.

Two gates. **Resolvability** drops detail nobody can see whatever the budget
allows — below 42 pixels a tile there are no props, below 20 no road markings,
below 13 a building is a box. **Budget** then steps down a fixed ladder until
the frame fits: props, markings, poles, shadows, building detail, tree detail,
silhouettes, trees.

The budget is enforced against `renderer.info.render.triangles` after an actual
render, not against the estimate. See ruling 019 for why — the cost model was
wrong four separate times, the last by 18,220 triangles because a tier-0 tree
was priced at zero.

Measured on a saturated 128x128 sixteen-seat region, 25 years, plain:

| span | tile px | triangles | plan |
| --- | --- | --- | --- |
| 12 | 60 | 19,442 | props dropped for budget |
| 25 | 29 | 61,164 | detail not resolvable |
| 40 | 18 | 54,354 | silhouettes only for budget |
| 70 | 10 | 68,152 | trees dropped for budget |
| 100 | 7 | 68,980 | buildings only |
| 180 | 5 | 68,980 | buildings only |

Every zoom under 80,000, `rebuilds=0` throughout — the estimate is now close
enough that the correction loop never has to fire. Before the tree-cost fix,
span 40 drew 103,290 against an estimate of 76,006.

Sweeping the budget at fixed zoom (span 25) shows it is really a control:
25k gives boxes on ground, 45k drops shadows, 80k keeps shape and shadows.

## Soft lighting for plain

Kjell: *"all three candidates looked very similar"*, with two more Transport
World references showing house detail.

The lighting was not the whole cause and changing it alone would not have
worked. Face shading is baked into every vertex at build time, so it dominates
the lights — three styles sharing one bake are three colour schemes. Contrast
is now a style property (ruling 020): plain 0.65, painted 1.0, pixel 1.3.

Plain's light was rebuilt as a ratio rather than a level: key 1.9 / fill 1.2
became key 1.15 / fill 1.25, the sun raised from 120 to 150 so shadows sit
under buildings, and the shadow blurred (radius 5) and paled (intensity 0.5).
Painted keeps its hard low sun and now says so explicitly.

A first attempt at contrast 0.4 with fill 2.15 was wrong and is recorded as
such in the source: it washed the buildings to flat grey and roofs stopped
reading as separate from walls.

### Still open, found while shooting these

Two things the reference has that we do not, both outside this slice:

- **Roofs share the wall's hue.** `ROOF` is a 0.44 multiplier on the instance
  colour, so a cream house gets a cream-brown roof. The reference gets much of
  its charm from roofs in terracotta, red and slate against cream walls. Fixing
  it properly means splitting a building into two instanced meshes, walls and
  roof, with separate colours.
- **The generated city is mostly road.** At several framings on a 96x96 region
  there were no buildings on screen at all — only asphalt, grass, trees and
  lamp posts. That is deputy and development balance, not rendering, and no
  lighting change will make such a frame resemble the reference.

## Walls and roof as separate meshes, and three things found on the way

Buildings are now two instanced meshes sharing one matrix (ruling 021). Roof
colours are a per-style palette split into house tiles and flat felt greys.

Three separate findings came out of shooting this, in descending order of how
much they were hurting the picture:

**1. Ground colours were being applied twice.** `make()` set the material colour
AND `push()` set the instance colour, and three multiplies the two — so every
road, marking, wire, pipe and ruin drew at the SQUARE of its palette colour. A
mid-grey road (`0x6f7278`, 0.44) rendered at 0.19. This is why the ground read
as near-black asphalt in every style and every screenshot so far, and why a city
that is 54% road looked like a car park. The palette had been right all along.

**2. Roof hue could not be reached by darkening.** See ruling 021.

**3. The reference's roofs are stepped, not smooth.** Its hipped roofs terrace
into three or four bands. A smooth prism at this camera angle reads as a wedge,
which is most of why ours looked like massing studies beside it.
`addSteppedGable` replaces the prism at FULL tier only — at SHAPE the steps are
smaller than a pixel and `addGable` does the job for a fifth of the cost.

Also added: a garden plot under every house and civic building, which is what
stops a suburb reading as buildings dropped onto a road surface.

Two colour choices were made and then unmade by looking at the render: tan and
brown house roofs (too close to the cream walls to be worth splitting for) and
full-scatter roof colour (terracotta slid into maroon; roofs now scatter at half
the rate walls do).

### Measured after all of it

| span | tile px | triangles | plan |
| --- | --- | --- | --- |
| 9 | 80 | 14,662 | props dropped for budget |
| 25 | 29 | 61,498 | detail not resolvable |
| 40 | 18 | 55,302 | silhouettes only for budget |
| 70 | 10 | 69,538 | trees dropped for budget |
| 100 | 7 | 70,366 | buildings only |
| 180 | 5 | 70,366 | buildings only |

Every zoom inside the 80k budget, `rebuilds=0`. Draw calls 27 → 42.
301 tests pass; `tools/client_smoke.mjs` passes on all three styles.

### New tool

`tools/where.mjs` reports where the city actually is — the densest window of a
given zone, plus the zone mix and the paved fraction. Written after framing four
screenshots at spots with no buildings in them. On the standard fixture:
**923 buildings (629 residential, 104 commercial, 126 industrial) and 54% of all
tiles paved.**

### Still open

- **54% of the map is road.** That is the largest remaining gap to the
  reference, and it is deputy and development balance, not rendering.
- Grass is a single flat green. The reference scatters flowers and two-tone
  patches through it.
- Chimneys take the wall colour and read as tan posts. The reference's are
  brick.

## N2 — the style decision

P13: **plain ships.** *"Soft cool light, bright cosy palette, shadows. The
cheapest to produce and the most legible."* Ruling 022.

`specs/art-direction.md` §3 is written — no longer intentions but the real
values: every palette hex, the lighting rig with its nine settings, silhouette
rules per category, and the height, value and detail ladders. The old docs test
that blocked the content lane is replaced by one that compares the documented
palette against `palettes.js`, so the specification and the renderer cannot
drift apart.

`pixel` and `painted` stay as the RenderStyle seam ruling 005 asked for. They
receive no art investment.

**Lane C1 is unblocked.** And because plain has no atlas, `asset-list.md` becomes
a list of parameters and shapes rather than of drawings — which is most of why
it was chosen.

## N3 — input and tools

The renderer drew a city nobody could touch. Now a person can play it:
`index.html` boots straight into a session with a toolbar, a cost readout, a
clock and undo.

**The split is deliberate.** `client/input/gestures.js` and
`client/input/runs.js` are pure and hold everything that is actually hard;
`controller.js` is listeners and coordinate conversion. Every input bug worth
naming is in the pure half and is tested there without a browser:

- a tap read as a drag, so tapping the map pans it a pixel
- a pinch that also pans, so zooming slides the city away
- lifting one finger of two, and the map leaping by half the pinch width
- a twist that rotates every frame instead of once per quarter turn
- a stroke left open by a pointer the browser took away

One finger paints when a tool is selected and pans when none is; two fingers are
always the camera. A drag is coalesced into **one** run-length encoded command,
and sampled pointer events are filled in with Bresenham — without that a fast
drag leaves a road with holes the player cannot see until traffic will not flow.

Cost preview calls the engine's `price()`, which stages the real command and
throws the transaction away. A cost computed from a table in the client would be
a second implementation of the pricing rules, and the two would drift.

### The gate

`tools/play_smoke.mjs` drives `index.html` with real pointer events at real
coordinates, on a 1280×720 mouse viewport and a 390×844 touch one. It asserts on
state, not pixels, and deliberately does not call the controller's methods — a
gate that pokes the API proves the API works, not that a hand on a screen
reaches it.

All 15 checks pass on both viewports: a dragged road appears (13 tiles) with no
holes, undo removes the whole drag rather than one tile, a dragged rectangle
zones 21 tiles, the camera rotates and pans, and road + zoning + plant + pump
grows the city from 2 buildings to 4 with population 16.

### Three things found by the gate

1. **`stop()` disposed the controller.** The harness paused the clock with
   `stop()` and every subsequent check failed, because `stop()` also removed
   every listener. The session now has `pause()`/`resume()` separate from
   teardown.
2. **The pan assertion tested the wrong axis.** It checked `targetX` after the
   camera had been rotated a quarter turn, at which point a horizontal drag
   moves `targetZ`. The pan had worked all along. It now asserts on distance.
3. **A city with no fire cover dies.** The growth check first ran 1200 ticks and
   failed at `1 → 1 buildings`. Traced: growth is fine — the first lot develops
   at tick 12 and there are five `developed` events — but at tick 502 a fire
   takes the only power plant, 59 `powerShortfall` events follow, and the last
   house is abandoned by tick 540. That is a city with no fire station and
   nobody rebuilding, which is N6 and N8's business, not this slice's. The gate
   now measures growth over 300 ticks, which is the question it is actually
   asking. **Logged as a finding**, not papered over.

### Also

`tools/play_shot.mjs` shoots the playable page itself on both viewports —
`tools/screenshot.mjs` shoots the renderer through a harness, and both are
wanted. `reports/play-desktop.png` shows pop 16 in year 2 with a house grown
beside the road it was zoned along.

Suite: 326 tests, green twice.

## N4 — HUD and overlays

The simulation was running where nobody could see it. Now the page shows a top
bar, demand, alerts, a grouped build toolbar, an inspector and all eleven
overlays of `gamedesign.md` §16.

**Model/view split**, as `plan.md` §7.1 asks for. `hud-model`, `rci-model`,
`alerts-model`, `inspector-model` and `overlays` are pure and tested without a
browser; `hud.js` turns their output into elements and holds no opinion about
what is allowed — a button that greys itself out on a rule it invented is a rule
nobody else enforces.

**The alert area** collapses repeats into one line with a count, ranks by
severity *before* capping at six, and only reports whitelisted event kinds
(ruling 023). The numbers that forced this are measured: one 1200-tick run of
the standard fixture produced 59 `powerShortfall` and 100 `budget` events
against the single `fireStarted` that mattered.

**Overlays** are banded by pure functions over state. Grey means not applicable
and is never painted, so the sea is not amber for crime. Every band carries a
colour, a mark drawn on the map, and a word in the legend and the inspector —
§16 and §30 both say never colour alone, and a legend under the map does not
help someone comparing two tiles in it. Power reads the powered FLAG rather than
the wire layer, which is the difference between a diagnostic and a decoration: a
wire whose plant burnt down is precisely the state the overlay exists to show.

### The gate

`tools/ui_smoke.mjs`, 54 checks. Every toolbar button is clicked **by
coordinate** — a hit test, not a handler call, because a button under another
element or too small for a thumb passes an API test and fails a person. Each is
checked for a 44px target, for selecting the tool it names, and for reporting
its own pressed state. Undo undoes; speed changes speed. Each of the eleven
overlays renders in at most four extra draw calls, and the eleven produce
**eleven distinct images** — an overlay that renders a plausible picture of the
wrong field is the failure that matters, and identical output is the cheap half
of catching it. The inspector opens on tap. The phone layout does not scroll
sideways and leaves 59% of the screen to the city.

### What the gate cost to get green

Three failures, all in the fixture rather than in the UI, and all found because
the gate insisted the city be worth photographing before it photographed it:

1. **The pipe had no source.** The pump is 1×1 and was placed at x=21 with the
   pipe spine at x=23 — two tiles short of its own network. The coal plant is
   3×3 and reached its spine by accident of size, which made the failure look
   like a power problem when it was a water one.
2. **`supplyReach` is 4**, and the wire ran at x=10 with the pipe at x=20. No
   tile is within 4 of both, so no lot could ever develop, whatever else was
   right.
3. **Two components per network.** With both spines carrying both networks but
   not joined to each other, one component held the plant and no water and the
   other held the pump and no power. `state.supply` said so plainly —
   `components: 2, served: 1, starved: 1` — which is worth reading before
   blaming the reach. Joined, the fixture goes to 26 buildings and 504
   residents.

Also: N4's HUD rewrite moved the toolbar out of `#toolbar`, which broke N3's
gate. Selectors fixed rather than the gate left stale.

Suite 354 tests green twice; `client_smoke`, `play_smoke` and `ui_smoke` all
pass. Overlay screenshots in `reports/overlays/`, phone HUD in
`reports/hud-phone.png`.

## N5–N10 — the rest of the singleplayer MVP

Built unattended on 2026-08-29 (P15). Decisions taken without asking are
recorded in **`playtest-notes.md`**, each with what it was, why, and the specific
thing to check when playing that would show I chose wrong.

### N5 — save and load

Three manual slots and a separate autosave, once per game *year* of ticks.
`tools/save_smoke.mjs` builds a city, saves, **closes the page**, opens a fresh
one against the same origin, loads, and compares state hashes. Export/import
round-trips to the same hash; a foreign file is refused.

### N6 — seven disasters

All of §12's majors: wildfire, earthquake, flood, storm, industrial explosion,
blackout, water contamination. One at a time, each telegraphed a month ahead
naming its place. Frequency comes from the existing `difficulty.disasterOneIn`
rather than a new knob. Damage goes through existing systems — a wildfire
ignites through `fire.js`, an explosion raises pollution, a blackout clears the
powered flag.

`tools/disaster_soak.mjs`, 200 games × 25 years: 356 strikes, every type fired
(44–55 each), no city left unrepairable at the moment of damage.

**The judgement in that gate is which moment it measures.** The first version
measured year 25 and failed three cities. A control run — same seed, same
deputy, disasters off — confirmed the disaster caused it. But what it caused was
a slow economic decline that a dumb AI never pulled out of, and the gate's words
are "leaves a city that **play can** repair". Measuring the deputy's competence
under the name of disaster recoverability would let a real economy bug hide
behind a disaster tuning knob. So recoverability is measured the tick after each
strike, and those three runs are **still reported every run** as an economy
finding for N8.

### N7 — traffic

The system the plan flagged as expensive. A Dijkstra per origin/destination pair
is the textbook answer and far too slow, so it is inverted: ONE multi-source BFS
from every job builds a distance field over the road network, then each home
walks downhill through it laying load.

**0.70ms median** on a saturated 128×128 with 8,899 road tiles, against an 8ms
share of the 16ms month tick. Across 200 games congestion correlates with
people-per-road at **r=0.547** and with the seed at **r=-0.075** — it tracks the
city, not the dice.

Honest limitation: everyone takes the shortest route even when it is full. There
is no rerouting around congestion.

Also measured and left alone: **161 of 629 homes** in the saturated fixture have
no road route to any job. The traffic model correctly reports it
(`noRouteToWork`); it is the deputy's road-building and development's
willingness to build unreachable houses. Fixing it inside traffic would hide it.

### N8 — era 1

`tools/sim_sweep.mjs`, 200 games across four configurations. The report is
`reports/balance-era1.md`.

- **Pollution average — fixed.** It divided by the whole region instead of by
  developed land, so it read 0 on almost every map. One word; now 8.
- **Runaway industrial demand — settled.** p95 294 against a cap of 1500.
- **Runaway treasuries — accepted, not fixed.** Median 1.9M, p95 3.8M from a
  §20,000 start.

The obvious lever for the treasury debt — per-tile wire and pipe upkeep —
**re-measured a failure the era-0 note had already recorded**: p25 treasury to 0,
p25 population 647 → 187. Reverted. `data/balance.json`'s note now records that
it has been tried and rejected twice, with numbers both times, so a third
attempt starts from the evidence.

`test/rules.test.js` no longer pins era 0. It now demands that every era above 0
has a sweep report in `reports/` justifying it and names the sweep in its note —
an era bumped without evidence is a number somebody liked the look of.

### N9 — advisor and quests

Quests are pure JSON over a **closed** condition language: a fixed vocabulary
over 16 named measurements, no expressions, no callbacks from data. An open
language in a data file is a way to run code you did not write. The catalogue is
validated at load, so a broken quest is a startup error rather than a silent
no-op at hour three.

13 quests authored across tutorial, growth, service, environmental and character
categories, including a branch whose choice writes a variable that gates later
quests — the slice's "a choice changes simulation variables and later dialogue".

### N10 — 13 of 13 MVP criteria

`tools/mvp_acceptance.mjs` checks every one of `gamedesign.md` §24 against the
real page, on desktop and a 390×844 phone viewport, driving pointer events at
coordinates rather than calling functions.

**It immediately found a real bug.** Criterion 12 failed: `disaster`, `traffic`
and `quests` had been added to `createState`, `copyState` and the hash but NOT to
the save projection — the five-places rule in CLAUDE.md, and I still missed one
three slices running. The save tests did not catch it because their fixture had
all three at their defaults, so they round-tripped to defaults and matched. The
test now sets every nested record to a non-default value first.

Two criteria are honestly partial and the script prints so rather than quietly
passing: whether the loop is *satisfying*, and whether touch is *comfortable*.

### State of the suite

406 tests, green twice. Five browser gates all pass: `client_smoke`,
`play_smoke`, `ui_smoke`, `save_smoke`, `mvp_acceptance`. Two soaks:
`disaster_soak` (200 games), `sim_sweep` (800 games).


---

## 2026-08-29 — Slice N11: the game becomes playable (P16, P17)

P16 asked for an omissions audit. It found one blocking omission and a gate that
had been hiding it.

### What was missing

`client/ui/hud.js` had **no building tool**. The toolbar offered Inspect, three
zone tools, de-zone, road, wire, pipe and bulldoze — nine controls, none of
which places a building. `client/input/tools.js` had defined a `building` tool
since N3 and nothing surfaced it. Development requires both `FLAG_POWERED` and
`FLAG_WATERED`, and the only sources of either are `coalPlant`/`gasPlant`/… and
`waterPump`/`groundwaterPump`/… — so **a human player could zone and pave
forever and nothing would ever develop**. Twelve buildings were in the
catalogue; zero were reachable.

`tools/mvp_acceptance.mjs` reported **13 of 13** anyway, because criteria 3 and 9
issued `CMD_PLACE_BUILDING` through `apply()` (lines 87, 88, 216, 220). Both
criteria are about the interface. The interface was missing. A gate that reaches
past the interface cannot see an interface that is not there — it reports the
same green it would report if everything were fine. **Ruling 026.**

Three smaller omissions, found in the same audit: the HUD was hardcoded English
(0 of 7 `client/ui/*.js` imported `i18n.js`, against answer A4 and ruling 008,
while `data/i18n/{en,no}.json` held 69 unused keys each); `CMD_SET_TAX` had
existed since the economy slice with **nothing in the client to send it**, so the
tax rate was a constant; and `traffic.js`'s `congestion` and `noRouteToWork`
events were not on the alert whitelist, so the traffic system shipped invisible.

### What was built

**The build menu.** `client/ui/build-model.js` — a pure projection of the
catalogue into categories (power, water, service, amenity — the order a new
mayor needs them) with the cheapest first inside each. Rendered as its own
toolbar row. Every button quotes `buildingCost(state, def)`, the same helper the
reducer now charges with, so a difficulty that makes everything 20% dearer
cannot leave the toolbar advertising the list price.

**The footprint ghost.** A building anchors at its top-left tile and grows right
and down, so a 3×3 plant's ghost now covers nine tiles. A one-tile ghost teaches
the footprint by refusal.

**The budget row.** `client/ui/budget-model.js` reads `budgetFor()` — the same
function the monthly pass settles with, so the panel cannot quote a number the
books disagree with. A tax slider, the rate, and income/upkeep/net.

**i18n.** Every model now hands the view a *key*; `hud.js` is the only place a
key becomes words. 158 new keys in both catalogues, 227 each. Two tests keep it
honest: one collects every key the models can emit plus every `t("literal")` in
`client/` and checks both catalogues; one refuses a string literal assigned to
`textContent` or `.title` in `hud.js`.

### Measured

- **`./test.sh` 415 tests, green twice.** Was 400.
- **`tools/mvp_acceptance.mjs` 13 of 13**, with criteria 3 and 9 now driven by
  `placeByPointer()`: focus the camera, click the toolbar button, click the
  ground, then verify the building is at the tile that was clicked. Criterion 7
  pulls the tax slider — **7% → 10%, read back from `state.tax`**.
- **`tools/ui_smoke.mjs` 90 checks** (was 54). Every one of the twelve building
  buttons is hit-tested by coordinate and reports its own `data-def`.
- `tools/save_smoke.mjs` 15 checks, `tools/play_smoke.mjs` 10 checks, both green.

### What failed on the way

**The build menu covered the map.** Twelve buttons appended to the tool row made
`.hud-panel` **293 px of a 720 px desktop viewport**, and criteria 3 and 9 failed
with "not placed" — `document.elementFromPoint()` at the projected tile centre
returned `DIV.hud-rci`. The click was landing on the HUD. The rows had wrapped
since N4 and nobody had noticed because there had never been twenty buttons.
Fixed by making every button row scroll horizontally at *every* width instead of
wrapping, which was already the phone behaviour; the panel is bounded now
however far the catalogue grows.

**Then the buildings were off the right edge.** With one scrolling row, the
water pump sat past 1280 px with no affordance — the fix for "no way to build a
plant" had become "no way to find the plant". The build menu moved to a row of
its own, carrying the `hud-toolbar` class so existing selectors still cover it.

**`ui_smoke` broke on `data-tool="building"`** — twelve buttons share the tool
and are told apart by `data-def`. Its hit-test loop now keys on `data-id`.

### Open for the playtest

The panel is **371 px of a 720 px desktop window** (51%) and **343 px of 844 px
on the phone** (41%, against the gate's 45% line). Both pass; the desktop number
is worse than the phone one and is a short-window problem. Recorded as **Q21**
rather than trimmed, because every row on it is something §13.1 asks for and
which one goes is Kjell's call, not mine.

Two alert kinds were added to the whitelist while it was open — `congestion` and
`noRouteToWork` — so N7's traffic system is finally visible to the player. Small
scope addition, noted here rather than smuggled.

---

## 2026-08-29 — The P18 audit: what the §24 gate does not ask about

A second omissions pass, after N11. The finding is not another missing button —
it is that **the §24 criteria describe playing one city, and the game can only
ever play one city.**

### Verified, with the command that shows it

- **No new-game screen.** `client/main.js` reads `?seed`, `?size`, `?join`,
  `?lang`, `?debug` and passes seed and size to `startGame`. Nothing else.
  Difficulty is never passed, so `defaultOptions` returns `DIFFICULTY_STEADY`
  every time — **relaxed and demanding are balanced, measured across 200 games
  each in era 1, and unreachable.** Terrain style, water style and disasters-on
  are likewise engine options with no way to set them. There is no restart:
  loading a save is the only way to change city.
- **No settings screen.** `data/i18n/en.json` carries `settings.sound`,
  `settings.volume.*`, `settings.language`, `settings.style`,
  `settings.highContrast`, `settings.reducedEffects` and the five `menu.*` keys.
  None is rendered anywhere. The locale is `?lang=no` only.
- **Quest text is not localised.** N11 put 227 keys through `t()` and the HUD
  chrome is clean, but `hud.js:308–313` renders `definition.title`,
  `definition.text` and `choice.text` straight from `data/quests/*.json`, where
  they are English string literals. That is the bulk of the words a player
  reads. Content lane C5 is unmet, not partially met.
- **Department funding (§9.4) does not exist.** `CMD_SET_FUNDING` has a constant
  and no handler; there is no `state.funding`; `coveragePass()` sets a flat
  `strength = 100`. `balance.json`'s `fundingMinPercent`/`fundingMaxPercent` are
  mirrored into `rules.js` and read by nothing. **The comment above
  `coveragePass()` claimed "Coverage falls off with distance and with funding"
  — it never has.** Comment corrected in this pass.
- **`client/capabilities.js` is 4/7 dead.** `isCoarsePointer`, `deviceClass`,
  `recommendedMapSize` and `sizeAdvice` have no callers. All four were written
  for the new-game screen, and `sizeAdvice` pairs with the unused
  `lobby.size.recommended` / `lobby.size.heavy` keys.
- **Empty directories:** `server/`, `worker/`, `client/lobby/`,
  `client/transport/`. Correct — Waves 5 and 6 have not started — and now
  asserted, so half-finished work between waves cannot sit unnoticed.
- **Wave 4 remainder unchanged since N11:** no minimap (4.1 asks for it), no
  audio (4.4), no PWA or service worker or high-contrast mode (4.5), no
  statistics (4.6). 13 quests against slice 4.3's 19. Reduced motion **is**
  handled (`style.css:94`, `:root[data-motion="reduced"]`).

### Written down so it cannot hide again

`test/omissions.test.js`, 5 tests. Every `CMD_*` constant is either registered
with the reducer or listed in `NOT_BUILT` with the slice that will build it;
nothing on that list has quietly gained a handler; nothing on it is sent by the
client; the eleven commands a person needs to play a city start to finish each
have a handler *and* appear in `client/`; and the four placeholder directories
are empty.

This is the N11 lesson generalised. `CMD_SET_TAX` hid for four slices because
nothing watched the gap between "the engine can do this" and "the game can do
this". Fourteen commands are in that gap today; all fourteen are now named, with
a reason.

### Measured

- **`./test.sh` 420 tests, green twice.** Was 415.
- `plan-v1.md`'s Progress section was three waves stale — it still said 1.2b was
  waiting on the user and Wave 3 was next. Rewritten against the repo.

---

## 2026-08-29 — Slice N12: a city you chose, in words you can read (P19)

Items 1 and 2a of the P18 audit.

### The new-game screen

`client/lobby/options-model.js` (pure: which options exist, which values are
legal, choices → the record `defaultOptions()` takes) and `new-game.js` (the
DOM). Size, difficulty, terrain, water, disasters, seed with regenerate.

The preview calls `generateWorld()` and **hands the result on to `startGame()`**,
so the region shown and the region played are the same object rather than the
same seed generated twice.

Shaped for slice 5.2, which should add rows rather than replace the screen: the
rows are a table, and `optionsFor(choices, seats)` already takes a seat count so
a room's options record and a singleplayer game go through one function.

**A URL naming a seed skips the screen** and starts that city. That is what
makes a city a shareable link, and it is what keeps all six existing gates
pointing at `?seed=1003&size=64` working unchanged.

**The default is 64 on steady, not `recommendedMapSize()`.** That function
answers what hardware can cope with, which is not the same question as what
makes a good first city; wiring it to the default opened every desktop player on
a 128×128 region. Capability now feeds `sizeAdvice()` only, which marks the
heavy sizes — ruling 011, advise never forbid. The advice is rendered **only**
on the heavy ones: "recommended for this device" on all four sizes says nothing
four times.

### The region namer was measurably wrong

`regionNameKey()` has produced `region.<shape>.<feature>` since worldgen was
written and **nothing had ever rendered one**, so the twenty-five keys were
never translated and the classifier was never looked at. Putting it on screen
showed a river map named "The Wooded Islands".

Measured over 400 regions, 80 per water style, before touching it:

| style | water p25/50/75 | landmasses | named (before) |
|---|---|---|---|
| none | 0/0/0 | 1 | plain 80 |
| lakes | 3/4/5 | 1 | plain 77, islands 1, valley 2 |
| river | 7/10/17 | 2 | **islands 62, archipelago 17, plain 1, valley 0** |
| coastal | 35/41/44 | 2 | **islands 44**, coast 33, valley 3 |
| archipelago | 49/59/71 | 2 | archipelago 17, islands 46, coast 13 |

The cause: the ladder tested the landmass count *before* it tested whether there
was any water, so a river crossing a plain split the land in two and the region
was "islands". Fixed by testing water first, and by requiring the second
landmass to be a real share of the first — a coast with a rock offshore counts
two landmasses and is not islands. After: **river 74/80 valley, coastal 54/80
coast**, lakes 66 plain / 14 valley.

`describeRegion()` gained `secondShare`. It is a derived display value, never
stored and never hashed, so no fixture moved.

**Left alone and recorded:** the archipelago style has a `secondShare` median of
10 — one dominant landmass with fragments — so it is named "coast" 43 times in
80. That is the generator being honest about what it makes, not the namer being
wrong, and tuning worldgen is not this slice.

### Quest content: 13 → 20, and every word in both locales

Written first, moved second, exactly as A24 chose. Four new tutorial quests (tax
rate, a first service building, a first park, two hundred residents), a fifth
milestone, a civic event, and the recoverable disaster scenario slice 4.3 asked
for. **10 tutorial + 5 milestone + 3 civic + 1 disaster + 1 character = 20.**

Four measures added, each a deliberate act with a test: `tax`,
`serviceBuildings`, `amenities`, `ruinedTiles`. The last is what makes a
disaster scenario expressible — available while there is wreckage, complete when
it is cleared.

Then every title, line and choice became a key. Quest data carries
`titleKey`/`textKey`; `validateQuests` requires keys rather than prose. The
engine cannot check a key against the catalogue — it does no I/O — so
`test/quests.test.js` does, and also refuses a quest carrying a raw `title`.
That last test is the one that matters: `t()` returns its own argument on a
miss, so English would have shipped as its own translation with nothing going
red. **Norwegian drafted, not reviewed (A21).**

Catalogues: 268 → 310 keys each.

### Measured

- **`./test.sh` 432 tests, green twice.** Was 420.
- **`tools/lobby_smoke.mjs` (new), 26 checks on desktop and phone.** Every
  difficulty selected by pointer, started, and read back off `state.options`;
  the region previewed is the region played; the address bar names the city; the
  link opens that city without the screen; "new city" returns to the screen.
- `mvp_acceptance` 13/13, `ui_smoke` 90, `save_smoke` 15, `play_smoke` 10 — all
  green, none edited.

### What failed on the way

**`test/omissions.test.js` went red on its second day, correctly.** It asserts
`client/lobby/` is empty because Wave 5 has not started; the new-game screen is
the singleplayer half of slice 5.2, so the directory left the list with the
reason written next to it. That is the test doing its job, not a false alarm.

**The lobby scrolled sideways on a 390px phone**, caught by the new gate. A flex
child defaults to `min-width: auto` and refuses to shrink below its content, so
the horizontally scrolling choice row pushed the whole page instead of scrolling
inside itself.

---

## 2026-08-29 — Slice N13: the game says what it is doing (P20)

### The finding

**Every refused action in the game's history said "0 tiles".**

`shared/protocol.js` has eight `RESULT` codes. Seven had strings in both
catalogues from the first commit. `client/game.js:107` even handed the reason to
the HUD — `hud.setPreview({ tiles: 0, note: result })` — and `setPreview`
**ignored `note`**, rendering `t("hud.tiles", { count: 0 })`. Reproduced with ten
in the bank and a coal plant selected:

```
buildings placed: 0
what the player is told: {"readout":"0 tiles","status":"","alerts":[]}
```

Nothing was missing except the last line of wiring, and nothing could tell:
`t()` returns its own argument on a miss, and a screen that was never built
throws no error. **Ruling 027.**

Two more from the same sweep: twelve `settings.*` keys with no screen, and a
`Continue` button in `new-game.js` that nothing ever passed an `onContinue` to —
so a returning player had to start a new city and shift-click a save slot.

### Built

**Refusals speak.** `setResult(result)` renders `t("result.<code>")` in the
readout with `data-result` for styling. `result.rateLimited` added — the eighth
code had never had a string at all.

**And they speak before the click.** The stroke preview already had the
reducer's own quote for priced tools and threw the reason away; it now shows it.
Buildings have no staging path to price, so their affordability is compared
client-side against the seat's treasury — **a hint, not a rule.** The click still
goes through and the reducer still answers; a UI check that *refused* would be
inventing a rule nobody enforces. The hover ghost turns red on the same test.

**Settings.** `settings-model.js` (pure) and `settings.js` (a native `<dialog>`
— focus trapping, focus return and Escape are three slice-4.5 jobs a hand-rolled
overlay would do badly). Language, high contrast, reduced motion. Preferences go
to `localStorage`, never to state: hashing them would make two players with
different contrast settings disagree about the world.

**Only settings that do something are offered.** Sound, volume and visual style
have keys and no implementation, so rendering them would be a control that
changes nothing — the exact failure being audited. They stay in `NOT_YET` with
the slice that will use them.

Language changes take effect on the screen the player is looking at: the panel
relabels itself, and behind it either the HUD is rebuilt (`session.relocalise()`)
or the lobby re-renders. Two different code paths, so the gate checks both.

**Continue.** Wired to the most recent save, offered only when there is one. The
state comes out of the file whole — nothing is generated. `startGame` now skips
`CMD_JOIN` when the seat is already held, because reclaiming a seat touches
`lastSeenTick`, which is hashed, and re-joining a restored city would move it
away from the checksum it was saved with.

**High contrast** drops transparency and blur first: a panel you can see the
city through has no guaranteed contrast ratio, because what is behind it changes
every frame. The reduced-motion media query is now guarded with
`:root:not([data-motion="full"])` so an explicit request for motion beats the OS
preference.

### Measured

- **`./test.sh` 444 tests, green twice.** Was 432.
- **`tools/lobby_smoke.mjs` 46 checks** (was 26), desktop and phone: the panel
  restates itself, the HUD behind it is rebuilt in the new language, high
  contrast reaches the document, the choice is remembered, a build you cannot
  afford says **"Ikke nok penger"** rather than "0 tiles", and **Continue
  resumes hash for hash** (`24a7b26c0c7e6151` both sides).
- `mvp_acceptance` 13/13, `ui_smoke` 90, `save_smoke` 15, `play_smoke` 10 — all
  green, none edited.

### The sweep is a test now

`test/reachability.test.js`, 4 tests. It reconstructs every key the interface
can build — including the runtime ones (`building.${def}`,
`region.${shape}.${feature}`, `quest.${id}.title`) — and requires each catalogue
key to be either reachable or in `NOT_YET` with its slice. Both directions, so
the list cannot rot.

Writing it found two more things immediately: `lobby.size.recommended` went dead
in N12 when the size advice became heavy-only (**deleted** — a key with no
future slice is dead weight, not a plan), and the first version of the scanner
reported a dozen live keys as dead because it only understood `t("literal")` and
not `labelKey:` fields or `t(x ? "a" : "b")`.

### What failed on the way

**The gate's own settings section was in the wrong place** — it asserted the
lobby was relocalised at a point where the page was in a game. Fixing the test
was the right call, and it improved the coverage: both relocalise paths are now
checked rather than one.

**"nothing to continue before anything is saved" failed**, and the code was
right. `shouldAutosave(tick, undefined)` returns true, so the first tick of any
game writes an autosave — deliberate, and documented where it is written. The
check moved to before any game has run, which is the only moment it is true.

---

## 2026-08-29 — Slice N14: the keyboard half of 4.5 (P21)

### The findings

**`?debug=1` broke the app.** `client/main.js` has dynamically imported
`./debug.js` since it was written; the file was never created. The import
failed, the boot's `catch` ran, and the running game was replaced by
"Something went wrong — Failed to fetch dynamically imported module":

```
?debug=1 → {"started":true,"notice":"Something went wrong…client/debug.js"}
```

The game had actually started; the error screen was painted over the top of it.
A documented URL parameter that breaks the app is worse than one that does
nothing. **Static imports fail loudly at load; dynamic ones fail only on the
path that reaches them** — which for a debug flag may be never.

**Four `role="toolbar"` rows had no keyboard pattern.** That role tells
assistive technology "this is one control, use the arrows". There was one tab
stop per *button* and the arrows did nothing, so a keyboard user was told to
press a key that had no effect and had no way to tell whether the game was
broken or they were. Adding the role in N4 **took working navigation away** by
describing something the code did not do. The tool row was also the only one of
the four with no `aria-label` at all. **Ruling 028.**

Neither of the two things `plan-v1.md` 4.5 names as its gate — "keyboard-only
and 200%-text passes" — had ever been measured.

### Built

`client/ui/roving.js` — the roving-tabindex pattern. `nextIndex()` is pure
because the wrapping is the part that is always subtly wrong. Applied to all
four rows; the HUD now returns a `dispose()`, since a language change rebuilds
it and listeners on detached nodes are a leak that survives the rebuild.

**Shortcuts** (§13.3): `r` road, `w` wire, `p` pipe, `b` bulldoze, `1`/`2`/`3`
zones, `0` de-zone, Escape clears, Space pauses, `+`/`-` zoom, Q/E rotate. The
zones are digits because R, C and I are the demand bars in every screenshot in
the design, and a player pressing R means the road tool. A key carrying Ctrl or
Cmd is never a shortcut — Ctrl-R is reload and Cmd-P is print.

**Arrows pan the map, but only from the map.** Inside a toolbar they move
between controls, which is what the role promises; stealing them globally would
have broken the thing being fixed. The canvas takes `tabindex="0"`,
`role="application"` and a label naming its keys.

**Keys stop at a modal.** An open `<dialog>` owns the keyboard, so a shortcut
cannot reach the map through the settings panel.

`client/debug.js` written rather than deleted: it reports the checks that need a
live session — hash stability, renderer stats, and **which untranslated keys are
on screen right now**, since `t()` returns its argument on a miss and a missing
string in play looks like a label somebody wrote in lower case with a dot in it.

### Measured

- **`./test.sh` 453 tests, green twice.** Was 444.
- **`tools/a11y_smoke.mjs` (new), 21 checks.** One tab stop per toolbar
  (`Tools: 1 of 10, Build: 1 of 12, Overlays: 1 of 11, Saves: 1 of 5`); the
  arrows walk and wrap; Home and End jump; the stop is remembered; all eight
  shortcuts select their tool; the arrows pan from the map
  (`(32.0, 32.0) → (35.5, 35.5)`) and **do not** pan from a toolbar
  (`35.50 → 35.50`); Escape closes the dialog and a shortcut cannot reach the
  map through it.
- **200% text, both screens, desktop and phone: no sideways scroll, nothing
  clipped.** Emulated by doubling the root font size, which is what a browser's
  text setting does to a stylesheet written in `rem`.
- All six existing gates green, none edited.

### What failed on the way

**200% text on a 390px phone clipped the top bar** — "Play", "New city" and
"Settings" were squeezed until their labels were cut. `.hud-top` was a
single non-wrapping row. It wraps now, and the buttons keep their intrinsic
width. This is the one thing the text-scaling gate found, and it would have
shipped: nothing else in the project renders at 200%.

### The class of bug, closed

`test/omissions.test.js` gained "every module the client imports actually
exists", scanning dynamic `import()` calls against the filesystem. Removing
`client/debug.js` makes it fail with `client/main.js imports ./debug.js`, which
is the exact bug it was written for.

---

## 2026-08-29 — Slice N15: statistics and the minimap (P22)

### The audit's finding: the tripwire does not exist

`test/fixtures/` is an **empty directory**. There is no `founding.json`, no
`two_player.json`, no `empty.json`, and no `tools/repin.mjs`. Nothing in
`test/` or `tools/` reads that path.

That contradicts three documents at once:

- `plan-v1.md` marks slice **0.4 done**, and its gate is
  "`test/fixtures/empty.json` passes".
- `CLAUDE.md` says "Hashed fields are listed in **two** places —
  `statehash.js` and the fixture test's local copy — so a hash change is always
  a deliberate two-file act." There is **one** place: `writeState()` in
  `engine/state.js`. `shared/statehash.js` holds the hash primitive, not a field
  list.
- The `/fixture-repin` skill documents a ritual for artefacts that do not exist.

**This slice changed hashed state** (a history buffer) and there was nothing to
re-pin, which is exactly the situation the fixtures exist to prevent. Recorded
here rather than quietly benefited from. Writing the fixtures is the next thing
I would do.

### Statistics (slice 4.6)

`engine/history.js` — one integer sample a month, oldest first, capped at 240
(twenty years). `plan.md` asks for buffers **bounded and hashed**: bounded
because a 200-year game must not grow without limit, hashed because two clients
that disagree about the graphs disagree about the city, and because a save that
restored a city with no history would show empty charts for twenty years of
play.

A rolling array rather than a ring with a start index. `shift()` is O(n), n is
240, once a month — and a ring index is the sort of thing that is off by one in
exactly the case nobody tests.

`HISTORY_CAP` and `HISTORY_FIELDS` live in `engine/constants.js`, not in
`history.js`: `state.js` needs them for the hash and the deep copy and cannot
import `history.js`, because history imports the reducer and the reducer imports
state. Same reason `copyDisaster` is local to `state.js`.

**The five places, all five:** `createState`, `copyState` (with a local
`copyHistorySamples`), `writeState` (length then fields in `HISTORY_FIELDS`
order — never `for (var k in sample)`), `toSave`/`fromSave` with a migration
that gives an older save an empty history, and the lobby options record (not
one — history is not an option). The snapshot projection does not exist yet.

**The pass is silent.** A sample is the most routine thing that happens, and an
event a month inside a pinned fixture would be drift.

`client/ui/statistics-model.js` carries `good: "up" | "down" | "flat"` per
series, which is the whole difference between "crime is up 40%" and "treasury is
up 40%" being the same arrow and opposite news. Movement under 5% reads as
"steady" — a city that wobbles 2% is not doing anything, and saying so every
month trains the player to ignore the screen.

§30 makes the explanation an accessibility feature: every series carries a
sentence, the sparkline is inline SVG with that sentence as its `aria-label`,
and the sentence is printed underneath as well. **A graph is not a statistic
until somebody who cannot see it gets the same answer.**

### The minimap (slice 4.1's last piece)

`client/render/minimap.js` — a 2D canvas, deliberately not three.js: it is a
picture of the tile arrays, and asking the GPU to draw a second scene to show
where the first one is would cost more than the map does.

Two layers on two clocks. The **world** (terrain, roads, zoning, buildings) is
painted once into an offscreen `ImageData` and blitted; the **viewport box**
is drawn on top every frame. Repainting 25,600 pixels at 60fps for a box that
moves is the obvious version and the wrong one.

Sampled per minimap *pixel* rather than per tile — a 48-tile region on a
160-pixel map would otherwise leave two thirds of the pixels untouched.

`minimap-model.js` holds the arithmetic, because a click that lands on the wrong
tile is invisible in a 160-pixel picture until the camera jumps somewhere else.

### Measured

- **`./test.sh` 476 tests, green twice.** Was 453. `test/history.test.js` (16),
  `test/minimap.test.js` (7).
- **`tools/ui_smoke.mjs` 99 checks** (was 90): the minimap paints
  **25,600 of 25,600 pixels in 46 distinct colours**; clicking three quarters
  across moves the camera to `(48, 48)` on a 64-region, where 48 is what three
  quarters means; all ten series have a row, an explanation over 40 characters
  and a chart label; none shows a raw key; the panel opens at the top.
- **`tools/a11y_smoke.mjs`** gained four checks: at 200% text the minimap stays
  on screen (`177..386 of 900`) and the statistics dialog fits, scrolls and
  clips nothing, on both viewports.
- All seven gates green.

### What failed on the way

**The statistics panel opened scrolled past every statistic in it.**
`showModal()` focuses the first focusable element, which was the Done button at
the bottom of a list taller than the dialog. The heading takes `tabindex="-1"`
and the focus instead — which opens at the top *and* is what a screen reader
should announce first.

**A module-level `SAMPLES` smell.** The first version of the sparkline reached
for the samples through a module-level variable rather than taking them as an
argument. Replaced before it could become two dialogs sharing one array.

---

## 2026-08-30 — Slice N16: finishing N15's own work (P23)

Statistics and the minimap landed yesterday as N15. This pass audited **that**
code rather than the project around it, and found two defects in it.

### The minimap showed a world that had stopped happening

It caches its picture into an `ImageData` and blits it, and it was told to
repaint only by `worldChanged()` — which `client/game.js` calls when the player
builds through the controller, and on a load. **Nothing called it on a tick.**

So a city that grew, burned down, flooded or was rebuilt by a disaster showed
the player the old world until they happened to lay a road. The 3D renderer
never had this problem because `updateInstances` reads state every frame; the
minimap was the one thing in the client with a cache and no invalidation.

Proved before fixing. 346 road tiles added outside the controller, minimap image
byte-identical:

```
road tiles now 346
minimap image 1673316772 -> 1673316772   UNCHANGED (stale)
```

**Fixed by repainting when `state.tick` moves.** Anything the simulation does
happens on a tick, so the tick is the exact signal; at fast speed that is about
eight repaints a second of 25,600 pixels, which is nothing. `worldChanged()`
stays for player builds, which happen between ticks and should show at once.

After:

```
before any tick: unchanged (expected — nothing has ticked)
after one tick: minimap 1673316772 -> 4133435918   UPDATED
```

**The first version of the proof was wrong and said so.** It applied a command
with the clock paused, which no real path does, and would have "proved" the bug
still existed after the fix. Re-written to model what actually happens: a change
lands, and a tick follows.

### The minimap lied about what it is

`role="img"` with `tabIndex = 0` and a `keydown` handler. That is **ruling 028's
own defect**, committed in the slice after the ruling: `role="img"` announces a
static picture, and a picture that takes focus and keys is not one. The Enter
key jumped to the middle of the map, which is a weak affordance invented to
fill a gap that was not there.

Now a picture and nothing else: `role="img"`, no tab stop, no key handling. The
keyboard path to the same job is the map's own arrow-key panning from N14, which
aims properly instead of jumping to the centre, so nothing was lost.

### Also

`MINIMAP_SIZE = 160` was duplicated as `width: 160px` in the stylesheet. The
canvas now sets its own CSS size from the constant.

### Measured

- **`./test.sh` 476 tests, green twice.**
- **`tools/ui_smoke.mjs` 101 checks** (was 99): the minimap follows changes the
  player did not make (`813334735 → 114076566`), and describes itself honestly
  (`{"role":"img","tabIndex":-1,...}`).
- All seven gates green.

### What failed on the way

**The new gate check broke a later one.** It painted roads across rows 2–7, and
the undo check thirty lines further down builds its fixture on row 4 — so undo
had nothing to remove and reported `30 → 30 tiles`. Moved to the bottom edge.
A gate that quietly paints over another gate's fixture makes the second one fail
for a reason that has nothing to do with it.

---

## 2026-08-30 — Slice N17: the tripwire that was never built (P24)

The P22 audit found `test/fixtures/` empty while slice 0.4 was marked done with
"`test/fixtures/empty.json` passes" as its gate. `CLAUDE.md` described a
two-file ritual around fixtures that did not exist, and the `/fixture-repin`
skill documented how to re-pin them. Four slices — N13, N15 and the two before
them — added hashed state with nothing watching.

### Built

`tools/fixtures.mjs` replays a fixture and checks **every step's** hash, result
and event kinds — not just the end state. An end hash tells you the run
diverged; a hash per step tells you where. It stops at the first moved hash,
because everything after one is noise.

Events are pinned as **sorted unique kinds**, not counts: the kinds are the
contract ("this command produced a `built` and nothing else"), while the number
of `budget` events in a tick is an implementation detail that would make the
fixture brittle without making it stricter.

`tools/repin.mjs` **requires a written reason**, writes it into the fixture, and
prints every hash it moves so the commit diff says what changed. It **refuses**
to re-pin over event drift unless told the events were meant to change, because
drift inside a pinned window means the reducer is wrong, not the fixture.

Three fixtures:

| fixture | what it pins |
|---|---|
| `empty.json` | slice 0.4's named gate — an empty 16×16 region, 288 ticks |
| `founding.json` | a seat, two roads, three zones, a plant, a pump, wire, pipe, a tax rate and four city years — **grown to 156 residents, 22 buildings, 192 tiles powered and watered** |
| `two_player.json` | two seats in two districts, each building on their own land; bulldozing a neighbour's road pinned as `notOwner` |

Each carries an `expect` block — the floor below which it is not worth
measuring. That is the "check the fixture before you measure it" rule made
mechanical, and it earned itself immediately (below).

### The second place

`test/fixture.test.js` holds `HASHED_FIELDS`, and a test compares it against a
brace-matched scan of `writeState()`. **`CLAUDE.md` has claimed since Wave 0
that hashed fields live in two places; they lived in one.** They live in two
now, and adding a field to the hash without adding it to the list is a red
suite. `CLAUDE.md` corrected to name the two files that actually exist.

### Measured

- **`./test.sh` 484 tests, green twice.** Was 476.
- **The tripwire was verified by planting a change**, not by assuming. First
  attempt planted `residentsPerLevel[3]` (60 → 61) and everything still passed —
  correctly, because the founding city never reaches level 4. Planting
  `residentsPerLevel[0]` (4 → 5) produced:

  ```
  founding step 12 (tick ×132): hash faa4e4eb2c37f23b, pinned 334a7a9e014e00dd
  ```

  Exactly the step where the divergence starts.

### What failed on the way

**The founding fixture's first draft grew nothing.** Hand-computed tile indices
put the wire eight rows from the zoning: `powered 0, watered 0, population 0`,
and it pinned forty steps of an empty field perfectly happily. That is the
failure mode the `expect` block now closes — a fixture that measures nothing
looks exactly like one that works. Laid out programmatically instead, verified
to grow, and only then pinned.

**The `expect` check reported twice.** After a hash failed at step 12 the replay
stops, so the half-built state reported `history.samples is 12` on top of the
real failure. It is skipped once a hash has already gone.

---

## 2026-08-30 — Slice N18: audio (slice 4.4)

`plan-v1.md`'s gate: "Audio is derived from state only: a muted client and a
loud one stay hash-identical, asserted in test."

### Synthesised, not sampled

Web Audio oscillators and a shaped noise buffer. **No sound files** — the
project ships zero runtime dependencies and has no build step, so an audio bank
would be a vendoring and licensing decision rather than a slice. Seven voices:
`place`, `refuse`, `chime`, `warn`, `alarm`, `collapse`, `boom`. They cost
nothing to download and cannot go out of sync with a bake that does not exist.

`Math.random` appears in the noise buffer. That is allowed and worth naming: it
is a speaker, three directories from an engine where it is forbidden, and it
feeds no decision the simulation can see.

### The layers

- **feedback** — the player did something. `place` on success, `refuse` on
  anything else. Refusals are audible because they are the thing the player most
  needs to notice and the readout naming them is at the bottom of the screen
  (slice N13).
- **notification** — collapsed by voice, ranked by priority, **capped at three
  a tick**. Fifty-nine `powerShortfall` events make one `warn`; the alert area
  learned this in N4 and the speaker learns it here.
- **ambience** — a continuous level from population and congestion, both hashed
  state, so two clients hear the same city. One oscillator pair started once and
  left running, its gain ramped: starting and stopping per tick would click.
- **music** — not built, and `settings.volume.music` stays out of the panel. A
  volume slider for silence is a control that changes nothing, which is the
  failure the P18 audit was about.

### Browser realities, handled

**First-gesture unlock** — an AudioContext starts suspended, so it is built
lazily on the first real interaction and nothing is allocated for a player who
never enables sound. **Voice pooling** — twelve concurrent voices, each tearing
down its own nodes on `ended`, because a long session otherwise accumulates
thousands of dead ones. **Ramps, never steps** — a gain set directly clicks.

Volumes are squared before they reach a gain, because a linear fader spends
most of its travel in the top of the range.

### Settings became real

`settings.sound`, `settings.sound.on/off`, `settings.volume.effects` and
`settings.volume.ambience` have been in both catalogues since the first commit
with nothing to show them. They are rows now, and left
`test/reachability.test.js`'s `NOT_YET` list. `settings.volume.master` stayed,
with a reason: the mixer runs master at full and the two bus levels are the
controls.

Four steps rather than a slider — a range input is a poor keyboard target and
nobody hears the difference between 62 and 68.

### Measured

- **`./test.sh` 497 tests, green twice.** Was 484. `test/audio.test.js`, 9.
- **The gate, as a test:** two identical cities ticked 120 times, one with every
  event fed to the audio model and its ambience read — `hashState` equal. If
  audio ever cached a level or a "last played" tick in state, that is where it
  would show.
- `tools/a11y_smoke.mjs` gained three: silent before a gesture, running after
  one, and muting reaching the mixer.
- All seven gates green.

### What failed on the way

**The settings panel showed no button as pressed** for the new rows. `mark()`
compared `button.dataset.value` — always a string — against `settings[field]`,
which is now a boolean for sound and a number for the volumes. The lobby had got
this right with `String(...)`; the settings panel had not, and it did not matter
until a row was something other than a string.

**The "silent until interacted" check passed for the wrong reason.** It ran late
in the accessibility gate, by which point the page had been clicked and typed at
dozens of times, so the context was long since unlocked. Moved to a page of its
own.

---

## 2026-08-30 — Slice N19: the PWA half of 4.5

`plan-v1.md`'s gate: "the app installs and plays with the network disabled".

### The precache list is a checked-in file, and a test keeps it honest

There is no build step, so no bundler can produce the list of files that make up
the app. `tools/make_precache.mjs` walks `client/`, `engine/`, `shared/`,
`data/` and `vendor/` and writes `client/precache.json`; `test/pwa.test.js`
regenerates it and fails when it differs.

That matters more than it sounds: a module added to `client/` and not to the
list is a game that **works online and breaks offline**, which is the worst kind
of bug to hear about second-hand. The test caught its own case within a minute
of being written — I had edited `main.js` and `index.html` after generating.

**The version is a hash of the cached files' bytes**, which is the version
handshake without a build step to stamp one. `sw.js` names its cache after it
and deletes every other cache on activate, so a returning player is entirely the
old version or entirely the new one — never half, which is the property that
matters when the cached thing is a deterministic reducer. `shared/protocol.js`
makes the same argument for the wire.

### The worker does the least it can

A service worker is the one part of a web app that can brick it for a returning
player. So: cache-first for the app (a fixed set of files whose identity *is*
the version, so revalidating each one on every load is traffic that cannot
change the answer), network-first for `precache.json` alone (or a new deploy
could never be noticed), and a navigation that misses falls back to the shell so
a deep link opened offline is the game rather than the browser's error page.

Files are cached **individually, not with `addAll`** — `addAll` rejects the
whole install if a single file 404s, which turns one missing file into no
offline app at all. Asserted by a test.

Registration happens **after boot**, not before: installing precaches
ninety-four files and a player waiting for a city should not be waiting for
that.

### Icons are SVG

No PNGs, because generating them needs an image pipeline the project does not
have and committing binaries for something drawable in forty lines is worse. Two
SVGs, `any` and `maskable`. **Recorded limitation:** some launchers prefer PNG,
and a browser that will not install from SVG will not install this. Nothing else
degrades — the game runs and caches identically.

### Measured

- **`./test.sh` 505 tests, green twice.** Was 497. `test/pwa.test.js`, 8.
- **`tools/offline_smoke.mjs` (new), 9 checks.** Installs and activates; **94
  entries under one versioned cache**; the network goes off; the **new-game
  screen opens with its strings** (`The Dust Valley`, five rows, "Start this
  city"); a city starts; **a road is built by pointer, 7 tiles**; the clock runs
  to tick 41; a save round-trips hash-for-hash. All with the network disabled.
- All eight gates green.

### What failed on the way

**"The network really is off" failed, and the code was right.** The probe
fetched `./index.html`, which the worker answered from cache — the worker doing
exactly its job. A probe of a precached file cannot detect an offline network.
Changed to a path nothing has cached, so the worker falls through to a real
fetch and that fetch fails.

**`precache.json` could not hash itself.** Writing the version into the file
changes its bytes, which changes the version. It is excluded from the hash and
still precached — an offline start has to be able to read which version it is.

---

## 2026-08-30 — Slice N20: department funding (§9.4)

The last named gap in the singleplayer design, and the one whose absence a
comment actively denied: `coveragePass()` said coverage fell off "with distance
and with funding" while `strength` was a flat 100. `CMD_SET_FUNDING` was a
constant with no handler, and `fundingMinPercent`/`fundingMaxPercent` were
mirrored into `rules.js` and read by nothing.

### Built

`state.funding` — a percentage per service, hashed, defaulting to 100. Coverage
is scaled by it before distance falloff, and **a department's upkeep is scaled
by it too**. That is the whole trade §9.4 exists for: better cover, or a smaller
bill.

Three steps in the budget row — Lean 50%, Normal 100%, Generous 150% — as a
native `<select>` per department. A `<select>` rather than nine buttons: it is
compact, it is a keyboard control without any work, and it scales at 200% text
without the budget row becoming a second toolbar.

**A rate outside the range is refused, not clamped.** A clamp turns a bug in a
caller into a silent surprise, and the reducer is the one place that must not be
forgiving.

### The tripwire earned itself, on its first real use

The suite went red in exactly the three places it should have:

```
✖ fixture empty.json / founding.json / two_player.json
✖ nothing on the not-built list has quietly been built     (setFunding gained a handler)
✖ permission matrix: every registered command is covered by a row
```

Then `HASHED_FIELDS` in `test/fixture.test.js` had to gain `funding` — the
two-file act `CLAUDE.md` has described since Wave 0 and which was not possible
until N17 — and the fixtures were re-pinned with a written reason. Every hash in
all three moved, which is correct: funding is read every month by the civic pass.

### Measured

- **`./test.sh` 509 tests, green twice.** Was 505. Four new civic tests,
  including the one that makes the old comment true: 50% covers less than 100%,
  150% covers more.
- All eight gates green.

### What failed on the way

**`tools/repin.mjs` refused its own reason.** With no `--only`, `argv.indexOf`
returns -1 and `onlyAt + 1` is 0 — so the filter that skips `--only`'s value
skipped argument zero, which is always the reason. It failed loudly rather than
re-pinning with an empty one, which is the right way for that bug to behave.

**The constants were in the wrong block.** `fundingMinPercent` lives under
`rules().service`, not `rules().economy`. The handler read `undefined` bounds
and refused every rate, including 150 — caught by the range test, not by
inspection.

**The budget row pushed the phone panel to 418px of 844px**, over the gate's 45%
line, and took `a11y_smoke` and `lobby_smoke` down with it. Exactly the failure
the build menu caused in N11, and the same fix: the row scrolls instead of
wrapping. Back to 322px.

---

## 2026-08-30 — Slice N21: ready to playtest (P25)

Two things a playtest hits in its first minute, neither of which existed.

### Naming (§5.1, step one)

"The player names the city and mayor" is the **first line** of the design's
onboarding, and there was no text input anywhere in the game.

The city's name is a hashed lobby option — appended to `OPTION_FIELDS`, never
reordered, because that list *is* the hash order. Player-authored text is
untrusted input and hashed state at once (CLAUDE.md), so it goes through the
engine's own `sanitiseText` at `LIMITS.NAME_BYTES`: control characters and line
separators stripped, whitespace collapsed, capped. `"  Ny   Bergen  "` and
`"Ny Bergen"` are the same city and hash identically, which is asserted.

The mayor's name needed nothing new — `CMD_JOIN` has sanitised a name since Wave
0 and the client was passing it `t("player.you")`.

Both are optional. **An unnamed city is called after its region**, which the
generator already named: a placeholder the player leaves alone is a city called
by a placeholder.

### The controls card

A playtester who forgot a key had nowhere to look. The shortcuts existed since
N14 and the only place any of them was written down was the map canvas's
`aria-label`, which is for screen readers.

`?` opens a card with four sections. **The tool half is derived from `TOOLS`**,
never listed by hand — a card that advertises a key the game does not have is
worse than no card, which is ruling 027's argument for strings and 028's for
roles. `test/help.test.js` checks the fixed bindings against the controller's
own source, and that no key is claimed twice.

Double-click focuses the tile under the pointer (§13.4). There is no selection
model, so the tile *is* the object.

### Measured

- **`./test.sh` 521 tests, green twice.** Was 509. `test/help.test.js` (7), plus
  naming tests in `state`, `lobby` and the gate.
- **`tools/lobby_smoke.mjs` gained nine checks**: the typed name reaches
  `state.options` collapsed and capped, the mayor's name is capped **by the
  reducer** (23 characters survived a 24-byte cap), the name travels with the
  link, an unnamed city takes its region's name, the card lists every section
  and every tool key (`R W P 1 2 3 0 B ↑ ↓ ← → Q E + − Space Esc Ctrl Z ?`),
  and `?` opens the card the card advertises.
- All eight gates green.

### What failed on the way

**The name never reached state.** The lobby generates its region when an option
changes — deliberately *not* on a keystroke, since the name does not affect
terrain — and then hands that already-generated world to `startGame`, which
ignores `options`. So the typed name went into the URL and nowhere else. Caught
by driving the real page, not by a unit test: `{"cityName":"","mayor":"Ada"}`.
The name is now written onto the generated world at Start, through
`defaultOptions` so it takes the same sanitising path.

**The link carried the raw string.** `sanitiseChoices` sliced to 24 characters
without collapsing whitespace, so a city called "Ny Bergen" produced
`?city=++Ny+++Bergen++`. It runs through the engine's sanitiser now, so the box,
the link and the checksum agree on one string.

**A gate check broke for an unrelated reason.** The "cannot afford" check placed
a 3×3 plant at the centre of the map and asserted `noFunds`; the new naming
steps changed which city was loaded by then, the centre was water, and it got
`invalid`. It now searches for buildable ground first.

### Recorded, not changed, before the playtest

**Right and middle drag pan rather than rotate**, which diverges from §13.4.
Rotation is four snapped angles on Q and E, and a free-rotate drag would fight
ruling 006. **Long press is not built** — a plain tap already inspects with no
tool held, and the contextual actions a long press would open do not exist yet.
Both are now "as built" notes in §13.4 rather than silent divergences.

---

## 2026-08-30 — Slice N22: `./run.sh` was broken, and eight gates did not notice

Kjell opened `http://localhost:8123` and got:

```
Something went wrong
Failed to resolve module specifier "three". Relative references must start
with either "/", "./", or "../".
```

### The cause

`tools/serve.mjs` sends `Content-Security-Policy: default-src 'self'; img-src
'self' data:; style-src 'self' 'unsafe-inline'`. There is **no `script-src`**,
so scripts fall back to `default-src 'self'`, which blocks inline scripts —
including `<script type="importmap">`. Without the importmap, `import * as THREE
from "three"` cannot resolve and the boot dies.

The browser said exactly what it wanted, in a **console** message rather than a
page error:

```
Executing inline script violates the following Content Security Policy
directive 'default-src 'self''. … a hash ('sha256-nrwuPWg9wi1daziyhZ…')
```

### Why no gate caught it

**Every one of the eight gates stands up its own throwaway static server inside
its own file.** None of them used `tools/serve.mjs` — the server `run.sh`
starts and the only one a player ever touches. So the entire suite and every
gate passed while the game did not start.

That is a worse version of ruling 026's failure: not a gate reaching past the
interface, but a gate reaching past the *deployment*. And the symptom was
invisible for a second reason — a CSP violation is a console error, and most of
the gates only listen for `pageerror`.

### Fixed

`tools/serve.mjs` now computes a **sha256 hash of every inline script in
`index.html` at startup** and puts those hashes in `script-src`. Hashes rather
than `'unsafe-inline'`: the policy exists to catch an accidental CDN import in
development, and `'unsafe-inline'` would let an injected script run too.
Computed from the file that is actually served, so the policy cannot drift from
the page — a hash pasted into a header is wrong the first time the importmap
changes.

The emitted header now carries exactly the hash the browser asked for:
`'sha256-nrwuPWg9wi1daziyhZHvNKQ9FJDKuEpGeyoPVzWEBoM='`.

### The gate that was missing

`tools/serve_smoke.mjs`, 11 checks. It **spawns `tools/serve.mjs` as a child
process**, exactly as `run.sh` does, and loads `http://localhost:8199` — the
bare origin a person types, not `/index.html`. It listens for **console** errors
as well as page errors, starts a city so module resolution is covered all the
way down to three.js, and checks the content type of every kind of file the page
needs, including the manifest and the service worker.

It also asserts the policy still refuses everything from elsewhere: hashes, not
`'unsafe-inline'`.

### Also

`dev-prompts.md` and `dev-questions.md` had **vanished from disk**. Untracking
them in P24 used `git rm --cached`, which keeps the files — but the same commit
ran `git add -u` afterwards, which staged the deletion of the now-untracked
paths and took them with it. Restored from `600fc3a`, and P24–P27 recorded,
which had been referenced from `dev-log.md` and `plan-v1.md` for two days
without existing. The gap was invisible because `test/docs.test.js` **skips**
the numbering check when the files are absent — correct for a fresh clone, and
exactly wrong here.

### Measured

- **`./test.sh` 521 tests, green twice.**
- **Nine gates green**, including the new one.

---

## 2026-08-30 — Slice N24: the interface the playtest asked for (P29)

Kjell's brief, all four parts, plus the two things measuring for it turned up.

### The bottom bar, the rail, and Auto

The bottom panel was **seven stacked rows** and had reached 55% of a phone
screen. Now:

- **one bottom bar** — demand, alerts, readout, the tools, and a **Build**
  button opening a popover above it. The twelve building buttons were a
  permanent second row; they are behind one button.
- **a left rail** with Overlays, Tax and Saves, each opening a **drawer beside
  it**. Eleven overlay buttons, the budget row and the save row were all
  permanent.
- **Auto**, the default overlay: zone tools show zoning, wire shows power, pipe
  shows water, road shows traffic, and putting the tool down clears the map. A
  manually chosen overlay **wins** — a player who asked for pollution wants
  pollution whatever is in their hand.

**Chrome: 55% → 28%** of a 1280×800 window. Q21 in `dev-questions.md` is
answered by construction.

### Skins

Three, as CSS custom properties: **modern clean**, **retro** (bevels, square
corners, no blur) and **dark** (cool chrome, a cyan accent that glows on the
pressed state). Kjell's call: **chrome only** — the world keeps `plain` and
ruling 022 stands.

### Two bugs found by building it

**`[hidden]` did not hide anything.** The attribute is a UA rule of
`display: none`, and *any* class rule that sets `display` beats it. `.hud-drawer`
is `display: flex`, so `drawer.hidden = true` left it on screen covering the
rail. The build popover (`.hud-toolbar` is flex) and **the minimap's own Hide
button** (`.minimap-canvas` is block) had the same bug and nobody had noticed —
the minimap toggle has never worked. One `[hidden] { display: none !important }`
fixes all three and every future case.

**Skins only half-applied, and so did high contrast.** 61 places used the system
colours `Canvas`/`CanvasText`, which `--bg`/`--fg` cannot touch — so
`:root[data-contrast="high"]`, which sets those variables, had been changing
almost nothing since slice N13. `a11y_smoke` only checked that `data-contrast`
reached the document, not that it changed a colour: measuring the part, not the
whole, again. All 61 now use the tokens. `.hud-speed` and `.hud-newcity` had no
rule at all and were falling back to the browser's own button.

### Measured

- **`./test.sh` 530 tests, green twice.**
- **All nine gates green**, five of them edited: the tool row is `#tools` (two
  elements carry `.hud-toolbar` now), buildings need the popover opened,
  overlays need the drawer opened, and `mvp_acceptance`'s touch-target check
  now measures only controls that are **on screen** — a closed popover measures
  0px, which is not "too small to tap", it is "not there".

### What failed on the way

**Four collisions, each found by a gate rather than by looking.** The rail sat
on the minimap; the drawer covered the rail that opens it; the build popover's
left edge sat under the rail, so the first three buildings could not be clicked;
and at 200% text on a phone the top bar wraps to 257px and a fixed `4.2rem`
offset put the rail *inside* it. The rail and drawer are one flex strip now,
offset by a published `--top-height`, and the rail steps aside while the build
menu is open.

**On a 390px phone the left rail is a third of the screen.** `play_smoke`'s
road drag started on a rail button. "Left edge first" was a brief for a desktop;
below 620px the rail is a strip above the bottom bar instead.

---

## 2026-08-31 — Slice N26: can every function be reached? (P31)

Slice N24 put **40 of the interface's 60 controls** behind a rail, three drawers
and a popover. That is the right trade for a map you can see, and it is also
exactly how a control goes missing: nothing errors, nothing goes red, the button
is simply somewhere nobody finds.

### The gate

`tools/reach_smoke.mjs` walks the HUD as a **discovery** rather than against an
inventory — a hard-coded list would pass forever after someone deleted a button.
For each control it works out what it is behind from the DOM, opens that by
clicking what a player clicks, scrolls it into view, and asserts a click at its
centre lands on it. Then it closes it again, so the next control is judged with
only its own container open.

**All 55 are reachable.** Every panel opens and closes from its own button;
`#help`, `#statistics` and `#settings` each open a dialog that Escape closes;
the minimap toggle hides the minimap; the speed button changes speed; no visible
control is out of the keyboard's reach.

### And the reverse, which was broken

The other half of "nothing is hidden" is whether anything is hiding the **map**.

`#hud > * { pointer-events: auto; }` has one id and beats any class selector, so
`.hud-side { pointer-events: none }` — written deliberately, and read as correct
three times — **never applied**. The rail strip on the left and the advisor
column on the right both span from under the top bar to the bottom bar, and
both are invisible when their contents are empty.

```
grid points over the map: 403
  with the bug:  278 reachable   (hud-aside×91, hud-side×10)
  fixed:         371 reachable
```

**101 of 403 sampled points on the map were dead** — a quarter of it, including
the entire right-hand third where nothing is drawn at all. A player clicking
there would have found the game did not respond, with nothing on screen to
explain why.

Nine browser gates saw nothing, because every control still worked and every
screenshot still looked right. **Ruling 029.**

### Measured

- `./test.sh` 537 tests, green twice.
- **Ten gates green**, `reach_smoke` new.
- Map clickability: **278 → 371 of 403** sampled points.

### What failed on the way

**Three of the first four failures were the gate's own.** Its openers toggle, so
clicking once per control shut the panel again for every second one and reported
alternating controls as unreachable. Leaving panels open made a later drawer
cover an earlier one and reported a collision no player would meet. And the
toggle test started from whatever state the walk had left, measuring the
opposite of what it claimed. A gate that walks a stateful interface has to
return it to a known state after every step.

The fourth was real, and it was the one worth having.

## N27 — Three things the playtest asked for (P32)

Three items, one from each layer of the game: a panel, the renderer, and input.

### 1. The cards can be closed

The advisor and the inspector take a `.panel-close` × in their upper-right
corner, labelled for a screen reader rather than left as a bare glyph
(ruling 028). Dismissal is remembered **beside the advice, keyed by quest id** —
the advisor rebuilds its innerHTML on every refresh, so a dismissal that lived
in the DOM would come back within the month. The next quest is news again.

One thing the implementation refused: **a card waiting for a decision gets no
×.** Its two choice buttons are the only place that decision can be made, and a
card you can close is a decision you can lose (ruling 027).

### 2. Wire and pipe are runs, not dots

Each network tile drew one square centred on it, which leaves a gap at every
tile boundary — a run of ten poles read as ten dots. They now draw a **hub plus
an arm towards each neighbour the connection mask names**, the arm reaching
exactly half a tile so two neighbours meet in the middle. The mask was already
there: the low four bits of a network tile, in `DIR4` order, maintained by the
reducer since the utilities slice. Nothing in the engine changed.

They keep their own styles rather than borrowing the road's: thin pale-grey
poles and thinner lines above the ground, wider flat blue mains below it.

### 3. The right mouse button

`onPointerDown` opened with `if (event.button === 1 || event.button === 2)
return;` under a comment saying those buttons panned the camera. They had never
done anything. Right-drag now accumulates and fires a quarter turn every 140
pixels — the four snapped angles of ruling 006, the same gesture as the
two-finger twist — and middle-drag pans. Neither requires putting the tool down.

**The camera pitch stays fixed** at ~35.26°, which is the ruling and not an
oversight: an axonometric view whose pitch moves stops being readable at the
angles that make it interesting.

### Measured

- `./test.sh` **546 tests, green twice**, then green twice again after the docs.
- **Ten gates green.**
- Pool counts on the real page: `wireHub 16, wireArm 30, pipeHub 15, pipeArm 28`
  against `road 20` — arms outnumber hubs, which is what a connected run looks
  like.
- Camera: `yaw 0 → 2` on a 300px right-drag; target `24,24 → 29.9,27.7` on a
  middle-drag; tool still `road` after both.

### What failed on the way

**Two of the three failures were the gates', again.**

`reach_smoke` reported the advisor's × unreachable. It was on screen and it
worked: the walk tags each control with a `data-reach-id` once, and the advisor
**replaces its own innerHTML** on any refresh, taking the marker with it. A
discovery walk over a live interface has to re-resolve before every look, never
hold a handle. The same check then failed on map clickability because the gate
had injected a decision card to test the no-× rule and left it on screen.

`lobby_smoke` failed one run in four with a hash mismatch that looked like a
save bug. It was the gate: it hashed the city **after** `await save(...)`, and a
tick already on its way lands in that gap, so the city hashed one month ahead of
the bytes on disk. Hash before the await.

---

## N28 — The build the playtest never received

**P33.** Three items. Two of them were about code that had already shipped.

### 1. The client could not replace itself

"Right mousebutton did nothing." "Waterlines and pipelines still do not
connect." Both had been built in N27, tested, gated and pushed three days
earlier. Neither had ever reached a browser.

`sw.js` serves cache-first and names its cache after a version in
`client/precache.json` — a hash of every cached file's bytes. Its header comment
describes the handshake carefully: a changed byte anywhere is a new cache, and
`activate` deletes every cache that is not the current one. Every word true;
none of it ever ran. **A browser re-installs a service worker when the worker's
own bytes change**, and sw.js is deliberately static. So `install` ran once, in
the player's first session, and the fetch handler served that build for ever.

Reproduced before touching anything: load the page, let the worker take over,
change a file, bump the manifest version, reload twice. Old bytes, and
`citygrid-63a2cbd73e1d` still the only cache.

The fix is one line of registration: `./sw.js?v=<version>`, read from the
manifest at boot. A new build is a new script URL, which is a new worker. The
page reloads itself once on `controllerchange`, guarded on there having been a
controller already — a first visit claims too, and an unguarded reload there is
a loop. Ruling 031.

`tools/update_smoke.mjs` is the gate that was missing. `offline_smoke` proved
the worker installs and serves with the network off, which is exactly the half
of the contract that hides the other half: a worker that can never update passes
it perfectly. The new gate deploys **twice** — first load, then a changed file
and a changed version, then a reload — and asks whether the player is running
the second build.

### 2. Right drag pans

N27 read P32's "right mouse button — hold down — to pan the map view" and
shipped snapped rotation on that button. Even on the build that never arrived it
was the wrong answer twice over: not what was asked, and a quarter turn every
140 pixels reads from the hand as nothing happening and then the world flipping.
Right drag pans, one for one with the pointer. Rotation keeps the wheel button.

`play_smoke` now presses both buttons on the real page with a tool in hand. N27
had no browser check for either, which is why the wrong gesture was invisible.

### 3. The ground closes up

Three defects, one shape: **a flat layer drawn at its own tile's height, over
terrain that is a continuous surface.** The terrain's corners are the average of
the four tiles meeting there, so any elevation step leaves a vertical gap, and a
camera at 35° looks straight into the grass through it. That is the "small green
grass space between them" — visible on every slope, and the reason a road with a
hill in it reads as broken.

- Roads, wire and pipe are drawn with `paveGeometry`: a flat top face with a
  skirt hanging below it. Ten triangles instead of two, for the tiles on screen.
- The networks are **one width from end to end**. N27's hub was 0.20 and its arm
  0.14, and at city zoom the arm falls under a pixel while the hub does not — a
  bead on a string, which is the dotted line again from a picture that
  technically joins up.
- Wire and pipe now sit **above** the road surface rather than under it. Both
  were below it, so a run crossing a street broke in two.

Ruling 030 amended rather than replaced: it already said a network is drawn from
its mask, and all three of these are what that costs in practice.

### Measured

- `./test.sh` **552 tests, green twice.**
- **Eleven gates green**, including the new `update_smoke`.
- The reproduction, before and after: manifest `deadbeefcafe` served, cache
  still `citygrid-63a2cbd73e1d`, `hud.js` still the old bytes after two reloads
  → after the fix, one reload, cache `citygrid-0000deployed`, new bytes, and the
  clock still runs on the build it updated to.
- `play_smoke`, tool in hand: right drag moved the camera 6.04 tiles and paved
  0 tiles and left `yawStep` at 1; middle drag moved `yawStep` 1 → 3.
- Screenshots at span 7 and span 40 on a road column with elevations
  `71,71,73,74,75,76,76,76,75,73,71,69,68` — the five green seams across the
  road at span 7 are gone, and wire and pipe read as unbroken lines that cross
  the road at both zooms.

### What failed on the way

**The suite and ten gates were green through all of it.** They were green while
the player was running a build from three slices back, and they had been green
for the four slices before that. Nothing in the project asked whether the thing
under test was the thing being served.

The first hour went on the wrong theory. The three complaints were treated as
three bugs, and the first probe — masks, pool counts, a right-drag with real
pointer events — came back saying the code was correct: `wireArm 20, pipeArm
24`, `yaw 0 → π` on a 300-pixel right drag. Correct code and a playtest that
disagrees is the shape of a delivery problem, not a rendering one, and that is
the reading that took too long.

`update_smoke` then failed on its own second check — the old cache "kept beside
the new one" — with `page.evaluate: Execution context was destroyed`. The gate
was asking the page a question while the page was reloading itself, which is the
behaviour the gate exists to confirm. It retries through the navigation now.

One more gate lie, resolved rather than filed: `play_smoke`'s new "right drag
does not build" check failed at 13 paved tiles. The tiles were the road the run
lays back down after testing undo, four checks earlier. The check compares
before and after now, not against zero.

---

## N29 — The camera is an orbit, and a junction looks like a junction

**P34**, the second playtest. Two items and a question.

### 1. The right button, fourth time lucky

The record is worth keeping, because it is four slices of getting the same
control wrong in four different ways:

- **N21** documented right and middle drag as panning. `onPointerDown` opened
  with `if (event.button === 1 || event.button === 2) return;` — they did
  nothing at all, and the comment above the `return` said they panned.
- **N27** woke them and put **snapped rotation** on the right button: a quarter
  turn every 140 pixels. Not what P32 asked for, and from the hand it reads as
  nothing happening and then the world flipping.
- **N28** made it **pan**, which is what P32's words actually asked for. P34:
  "right mouse button only pans view like left mouse button."
- **N29** makes it an **orbit**. Sideways turns the camera; up and down tilts
  it. Middle drag pans. Three buttons, three things.

The lesson, and it is not about mice: P32 asked for panning **because panning
was the only camera verb it knew the game had**. The right answer was the one
behind the request — give the second button the job the first one cannot do.

**Ruling 006 is amended, not broken.** The four snapped yaw angles are what Q, E
and the two-finger twist give, and `rotate` now snaps from wherever a free drag
left the camera — so a key press is also the way back onto the grid. What the
ruling protects is being able to look behind a tall building; an orbit gives
more of that, not less. The four sprite sets it was really guarding against are
not owed, because ruling 022 chose meshes.

The pitch was a module constant, `atan(1/√2)`, and is now a field on the view,
clamped to 12°–82°. 82° rather than straight down because a camera parallel to
its own up vector has no `lookAt`; 12° because below that the front row hides
the city.

### 2. Road markings from the mask

The marking was one centred dash per tile, turned to the tile's axis by
`(mask & 2) || (mask & 8)`. A crossroads got a single stripe pointing one way; a
corner got a stripe pointing across the turn. `roadMarkings` reads the same four
bits the network ribbons do (ruling 030) and draws three cases: a dash on a
straight run, two arms **meeting at** the centre at a corner so the elbow has no
hole in it, and an arm per approach **stopping short** of the middle at a T or an
X — because a road does not paint its centre line through a junction, and an
unbroken cross reads as a plus sign. One or no connections gets nothing.

The dash is one unit-length stripe scaled per instance, so the three cases cost
one pool rather than three; the pool went from 24 000 to 60 000, because an X
draws four where there used to be one.

### Measured

- `./test.sh` **560 tests, green twice.**
- **Eleven gates green.**
- `play_smoke`, tool in hand: right drag `yaw 1.571 → 1.011`, `pitch 0.615 →
  0.803`, camera target unmoved, 0 tiles built, and the resulting yaw is
  **0.643 quarter turns** — off the snapped grid, which is the point. Q then
  landed it back on exactly 0.
- A real right-drag on the page: `35.3° → 50.2°`, then a long downward drag
  clamped at exactly `12.0°`.
- Screenshots of a grid with two X junctions, four Ts and four corners at span
  16, at 35°, at 50° off-axis, and at 12°.

### What failed on the way

**Two of the new tests were wrong, and both were wrong in the same direction —
asserting the shape of the implementation rather than the property.** One
demanded that `const PITCH` disappear from `camera.js`, when the right thing is
for it to survive as the default a new view starts at; the assertion should be,
and now is, that `applyPose` poses from `view.pitch` and not from the constant.
The other claimed a 20° camera must reach more than twice as far as an overhead
one, which is false for a 16:9 view where the horizontal half-extent dominates
the diagonal: 1.68×, not 2×.

**The pitch reached further than the culling did.** `visibleBounds` had a
comment explaining that a *rotated* view sweeps a larger axis-aligned box and
covering it with the diagonal — correct, and yaw-only. A tilted orthographic
frustum lands on the ground stretched by 1/sin(pitch), nearly three times as far
at 20°. Without that the first low-angle screenshot would have ended at a
straight line across the middle of the screen. Caught by writing the bounds test
before the camera change, not after.

---

## N30 — The budget was counting a fiction

**P35**, a review round: update the docs, then look for what has been missed.
The docs needed six edits. The sweep found something worse.

### What nothing was checking

Ruling 019 says the triangle budget is *measured*: `choosePlan` estimates,
`draw()` renders, reads `renderer.info.render.triangles`, and steps down the
sacrifice ladder if it is over. It also says, in its own consequences, that any
new cost "must be priced in `DEFAULT_COSTS` **and** measured, or it will be
spent without being counted".

That rule was written and then not applied to the ground. Buildings and trees
have been measured by `createInstances` since N1. Roads, markings, poles and
props were remembered constants — and wire and pipe had no price at all. So when
N28 turned a road from a two-triangle quad into a twelve-triangle skirted box,
the table still read `road: 2, // one upward quad`.

Measured on a saturated 96×96 at span 28:

| | triangles |
| --- | --- |
| what the planner believed | 79,068 |
| what three actually drew | **97,500** |
| budget | 80,000 |
| ladder | `trees dropped for budget` — the last rung |

A saturated city was rendering with no props, no markings, no poles, no shadows,
box buildings **and no trees**, and was still 22% over budget. The suite was
green. Eleven browser gates were green. Every screenshot looked plausible,
because a city with no trees looks like a city with no trees.

The breakdown named the culprits exactly: `road 2489×12 = 29,868`,
`wireArm 1350×12 = 16,200`, `pipeArm 1350×12 = 16,200`, `wireHub` and `pipeHub`
8,100 each. Roughly 78k of a 97.5k frame was ground geometry that had cost 8k
two slices earlier.

### Three corrections, each measured

**A road is a colour of the ground.** The terrain mesh already emits two
triangles per tile with corner-averaged heights; colouring a road tile with the
road colour is seamless *by construction*, follows the ground exactly, and costs
nothing. That is a better answer than N28's skirt to the same question, and it
deletes 29,868 triangles and `paveGeometry` with it. Ruling 030's skirt
amendment is marked superseded rather than removed — the diagnosis was right.

**The ribbons are quads again.** Wire and pipe are drawn well clear of the
ground, and that offset already carries a run over any step it crosses. −48,600.

**Casters count once.** The estimate doubled every caster for the shadow pass,
which was correct when it was written and measured: ruling 019's own table
records "actual was 2× the estimate". It is not correct now. On the real page,
toggling `shadowMap.enabled` moves `renderer.info.render.triangles` by **exactly
zero** — three resets the counter after the shadow pass — and that counter is
what ruling 019 *defines* the budget to be. Charging twice against a measurement
that only counts once put the estimate 92% over at close zoom.

Plus the ground costs are measured now, props are counted at the rate the
renderer actually places them (0.56 a paved tile, 1.45 a field, from its own
rules) rather than one per tile, and markings are counted per junction.

### Measured

- `./test.sh` **568 tests, green twice.**
- **Twelve gates green**, including the new one.
- Estimate against actual on a saturated 96×96, before and after:

  | span | before | after |
  | --- | --- | --- |
  | 10 | 24,338 est / 17,652 actual — 38% out, props dropped | 39,641 / 38,999 — **2%**, full detail |
  | 20 | 65,222 / 43,654 — 49% out | 41,393 / 43,654 — **5%** |
  | 40 | 73,992 / 74,616 — 1% out | 77,196 / 77,808 — **1%** |
  | 80 | 73,992 / 74,616 — 1% out | 73,992 / 74,616 — **1%** |

- The frame that was 97,500 over an 80,000 budget is **55,852** at the same
  zoom, with trees back.
- `tools/budget_gate.mjs` holds both numbers: inside budget at four zooms, and
  the estimate within 25% of what three drew.

### What failed on the way

**`lobby_smoke` went red again on the check N28 "fixed".** N28 closed the race
on the save side — hash before the `await`, because a queued tick lands in the
gap. The resume side had the same race and was left open: the restored city
publishes its session and the clock is a `setInterval` that can fire once before
the next `evaluate` pauses it, so the city hashes one month past the bytes it
was restored from. It looks exactly like `startGame` mutating a restored city.
Closed properly this time, by pausing *on publication* — an init script defines
a setter for `globalThis.CITY` that pauses inside the assignment, where no
interval callback can interleave. Six consecutive clean runs.

**Two of the new lod tests were wrong because a fixture was incomplete**, not
because the code was. Adding five terms to `countScene` made every hand-written
`counts` literal in the tests produce `NaN` through `estimate`. The temptation
was to make `estimate` tolerate missing terms; the whole finding above is what
happens when a budget quietly accepts a number it should have refused, so the
fixtures were fixed instead.

**The first measurement was wrong by 90ms.** The initial timing put a terrain
rebuild at 103ms per build action, which would have been alarming. It was
SwiftShader's frame time: the same loop without the rebuild cost 93.5ms. The
rebuild is ~12ms. Measure the difference, not the total.

## 2026-09-05 — Planning: cityviewer (P37)

Read both fable51 worlds end to end — Union Square (`src/world`, `facade/`, `life/`,
`player/`, `systems/`, the bpy and QA tools) and Higashiyama (`docs/KIT.md`, `core/`,
`world/terrain.js`, `plots.js`, `streets.js`, the baker, the post pipeline, the tools) — against
`client/render/` as of N30 and the P36 lane.

**What they have that we do not is one layer**: a world model between the data and the
meshes. Union Square's is `StreetSpec` + footprints + a facade grammar; Higashiyama's is one
height function with corridors, plots on a frontage, and a baker. Everything else — cars,
kerbs, signage, a walker — is built on it. We read raw tile arrays in eleven places of
`instances.js` instead.

Wrote `specs/engine/` (thirteen documents) as the specification of a renderer rebuilt in place
behind the `createRenderer` interface, then put the choices to Kjell. Chosen: the painted
look, perspective as the play camera, 20 m a tile, no binary assets; recommendations accepted
on traffic (local car-following), relief (0.5 m a step) and addons (hand-rolled). Named
cityviewer.

**Produced:** rulings 032–040, an amendment to 006, A26–A28 (closing Q24–Q26), the E- and
P-series lane in `plan-v1.md`, and pointers in `README.md`, `CLAUDE.md` and `specs/plan.md` §6.

**Not built:** anything. The first slice is E0, and its gate is that the picture does not
change.

**Two facts worth keeping from the read:**

- Ruling 017 rejected outlines because a luminance Sobel fires on detail. Higashiyama's ink is
  a second difference of *depth*, flat on any plane at any angle — a different instrument, and
  the reason 033 can make `painted` real without re-fighting 017.
- Both worlds seat a building on the *lowest* corner of its footprint and let a plinth take the
  slope. Seating on the mean floats one corner, and it looks fine in every screenshot that does
  not happen to look at that corner.

## E0 — The city model

*The first cityviewer slice (ruling 032). Pure, node-tested, and the gate is
that the picture does not change.*

**Built:** `client/world/` — `config.js` (a mirror of `data/cityviewer.json`,
the `rules.js` pattern), `hash.js` (`pseudo`, `jitter`), `params.js` (one
function for everything a building looks like), `corridors.js` (road runs
between nodes, bend connectors, nearest-corridor search), `ground.js` (the
height function: bilinear land over averaged corners × `RELIEF_M`, corridor
flattening with a smooth hand-off, water clamp), `lots.js` (rect in metres,
setback by zone, frontage by road count with hash tie-break, seat on the lowest
corner, bays), `model.js` (`createModel(state)` and `surfaceAt`). `scene.js`
owns the model and rebuilds it in `worldChanged()`; `instances.js` reads every
building through `buildingParams`; `detail-kit.js` and `building-kit.js` take
`pseudo` and `variantFor` from the model instead of defining them.

**Measured:**

- `tools/screenshot.mjs`, seed 1003, 20 years, 64×64, plain, at the default
  span and at span 12: **both PNGs byte-identical** before and after
  (`7d0c3a2c…`, `ea174655…`). 187 buildings, 59 and 53 draw calls, 68,484 and
  60,078 triangles, unchanged.
- `test/world.test.js`: 21 tests. A straight road of six tiles is one corridor
  of 100 m; a T is one junction and three corridors; a bend is two and a
  sampled curve; a north–south road across an east-rising slope is level to
  0.02 m across its 8 m width and monotone through the 4 m blend; a 2×2 house
  on the slope seats on its lowest corner.
- Suite: 588 pass, twice.
- `client_smoke`: plain 56 and 53 draws, pixel, painted — all four checks ok, 236 buildings on its fixture.

**What failed on the way:**

- A lot with no road beside it faced north instead of the road to its east.
  `nearest()` rejected the corridor on its padded bounding box before the
  distance was ever measured, so a search with `max = Infinity` searched
  nothing. The box is now widened by the slack between the default reach and
  the requested one. The test that caught it is the one written for exactly
  that case.
- `test/render.test.js` asserted the zone tint by regex over `instances.js`
  source, and the tint had moved to the model. Rewritten as a behavioural test
  against `zoneTint()` — which is the point of a pure module: the old test
  could only check that a number was typed, the new one checks what it does.

**Not done, deliberately:** the renderer consumes nothing but `buildingParams`
yet. `heightAt` (V4), corridors (E3) and lots (E5) have their own slices, and
chunked rebuilds of the model wait for the first consumer that pays per chunk
(E2).

**Next:** V2 (the quality tier) or E1 (the lane graph); `workitems-cityviewer.md`
carries the rest for whoever picks it up.

---

## V2 — The quality tier

**P38**, first item of the cityviewer hand-off. Low / Medium / High, defaulted
from the device, remembered, rendering only (ruling 040).

### What was already there

Almost all of it. `createRenderer` has taken `pixelRatio`, `antialias`,
`shadowMap`, `triangleBudget` and `shadows` since N1 and **nothing had ever set
one of them** — `pixelRatio` defaulted to 1 on every machine, so an RTX card
rendered at CSS pixels. `deviceClass()` has been written and unused since N12.
The slice is mostly wiring, which is what the plan said.

Three things were new: the tier table in `data/cityviewer.json` (mirrored in
`config.js`, `test/world.test.js` deep-equals the whole file so it cannot
drift), a settings row, and the governor.

### The governor

`client/render/governor.js`, pure — no `performance.now`, no globals; time
enters only as the frame deltas the caller feeds it, which is what lets a test
compress a minute into a loop. A rolling p95 over 60 frames; a second over
target and the next optional pass goes, in the order **ink → shadows →
supersample**.

Two decisions inside it are worth the words:

- **p95, not the mean.** A mean is dominated by the frames that were fine, and
  the complaint about a phone is the one frame in twenty that hitches.
- **A sacrifice is never handed back.** The frames came good *because* of it, so
  a governor that gave it back would oscillate once a second for the session.
  Only `reset()` clears it, and only a tier change calls `reset()`.

`draw()` takes `frameMs`. It is measured in `game.js`'s rAF loop, not inside
`draw`, because `draw` is also called by the gates and the screenshot harness
where wall-clock time means nothing.

### What failed on the way

**The Low tier did not fit its own budget.** The gate was green at three tiers
and the picture was not: shooting the default view of a 64×64 wired city at Low
came out at **42,202 triangles against 40,000, with the whole ladder already
spent** — the N30 failure again, one slice after the gate for it was written.

The gate had four spans on one 96×96 saturated city, and the view a player
actually opens on is none of them.

The cause, once measured per pool: on a wired city the utility ribbons are the
largest single thing on screen — `wireArm 5020`, `pipeArm 5020`, `wireHub 1718`,
`pipeHub 1718`, **13,476 instances and 43% of the frame**. A wire ribbon is 0.16
of a tile wide, so below about twelve pixels a tile it is drawing a line thinner
than a pixel. So: a resolvability gate at `px < 12` *and* a ladder rung after
poles and before shadows, and the power and water overlays still say where the
network reaches. Low came back at 34,608 of 40,000; Medium and High are
unchanged, because the rung only fires under budget pressure.

`budget_gate` now also runs each tier at the opening span, which is the case
that found it.

### Measured

- `./test.sh` **588 tests, green twice.**
- **Twelve gates green**; `ui_smoke` 101 → **108 checks** (it never looked
  inside the settings panel before).
- The three tiers on a 64×64 at the default span, from `screenshot.mjs`:

  | tier | triangles | budget | draws | ladder |
  | --- | --- | --- | --- | --- |
  | low | 34,608 | 40,000 | 54 | networks dropped for budget |
  | medium | 68,484 | 80,000 | 59 | detail not resolvable |
  | high | 68,484 | 200,000 | 59 | detail not resolvable |

- The governor on the saturated 96×96, **under SwiftShader** — software
  rendering, so these say what the governor does, not what the game runs at:

  | tier | p95 before it acted | gave up | p95 after |
  | --- | --- | --- | --- |
  | low (target 33 ms) | over | ink, shadows, supersample | **19.3 ms** |
  | medium (33 ms) | 271 ms | ink, shadows | still over — mid-descent |
  | high (16 ms) | 216 ms | ink, shadows | still over — mid-descent |

  Low is the interesting row: it is the tier that has somewhere to go, and it
  got there.

- `settings.reducedEffects` deleted from both catalogues and from the `NOT_YET`
  inventory — it had promised a screen since slice 4.5 and this is the screen
  (ruling 027).

---

## E1 — The lane graph

A corridor is where the road is; a lane is where a car is. The difference is a
direction, an offset to the right of the centreline, a stop line short of the
junction, and a curve through it — `client/world/lanes.js`, pure, derived like
the rest of the model (rulings 032, 037).

Connectors are links too, flagged `kind: "turn"`, rather than a separate kind of
thing. A car then only ever follows `next` from link to link and everything it
touches has the same `pts` / `cum` / `len` / `sample` shape. V1 gets a graph
walk instead of a special case at every junction.

### What the tests caught

**Right turns came out zero metres long.** With a 4 m lane offset and a 2 m stop
line, a northbound lane's end and the eastbound lane's start are the *same
point* — so the connector between them had no length and a car would have
teleported round every corner. The symptom was not "a zero-length link": it was
**a T junction reporting two connectors instead of six**, because the zero-length
ones were being silently dropped by a guard. The fix is what the hand-off
actually said and I had read past: trim to the junction **box**, not to the node
centre. An `end` node has no box, so a straight road keeps `5 × tileM − 2 ×
stopLine` and the item's own arithmetic still holds.

**Two of the fixtures were lying.** `pave(row); pave(column)` recomputes the
masks of the second group only, so the tile the two runs share keeps its
straight-through mask: no junction at all, and a corridor walk that wandered
1,402 m looking for an end. The reducer never leaves a mask inconsistent and the
helper now paves everything before recomputing anything.

### The model got faster, not slower

The lane graph asks for the ground height once per lane point, and `heightAt`
walked **every corridor** in the map per call. On a saturated 96×96 that was
37,332 queries against 773 corridors: **97 ms of a 123 ms model rebuild**, on
every build action.

Two measured fixes, and one measured non-fix worth recording:

1. **A uniform grid over corridor boxes**, one cell per tile, in
   `deriveCorridors`. 123 → 75 ms.
2. **A segment-level index instead** — tried, because a corridor box is a poor
   filter for a long road. It measured *worse* (75 → 77 ms): the closest-point
   scan was never the cost. Reverted rather than kept.
3. **Connectors take their end heights from the links they join.** Their two
   ends *are* those links' ends, whose heights are already computed, and the
   ground inside a junction box is flattened by the corridor blend anyway. That
   is 30,000 of the 37,332 queries gone. 75 → **35.7 ms**.

So E0's model alone was 26 ms before and 17 ms now; the whole thing including
the lane graph is 35.7 ms. E1 costs about 10 ms net and the index paid for the
rest of it.

### Measured

- `./test.sh` **607 tests, green twice**; 19 new in `test/lanes.test.js`.
- **Twelve gates green.** No hash moved.
- `node tools/lanes_dump.mjs` on a saturated 96×96, seed 1003, 400 ticks:

  ```
  model built in  35.7 ms  (lane graph 19.0 ms of it)
  corridors       773
  nodes           460  (bend 5, junction 372, end 83)
  lanes           1546
  links           5810  (1546 block, 4264 turn)
  turns           left 1423, right 1423, straight 1418
  signals         372
  entries/exits   83 / 83
  block length    median 68.0 m, p05 52.0 m, p95 68.0 m
  shortest link   8.32 m (turn right)
  ```

  Left and right turns balanced to within six of each other is the check that
  the handedness is not systematically wrong; 8.32 m against a 4.5 m car is the
  one the geometry bug above would have failed.

---

## V1 — Traffic you can see

The thing that was asked for, four items ago. `client/life/traffic.js`: cars on
E1's lane graph, density and speed from `state.tiles.traffic` — the per-tile
commuter load the engine has computed since N7 and which, until now, only an
overlay tint and one inspector row ever read.

**Nothing here is state** (ruling 037). No vehicle, no position, no float
reaches the reducer; every choice a car makes is a hash of an integer that is
already in state, so two clients showing the same city show the same traffic
without agreeing on anything. The engine decides how busy a road is; this
decides what busy looks like.

### The measurement that changed the design

The first version spawned cars at the speed limit and let a density target fill
the road. It gave the same picture at every load: 36 cars at 8.6 m/s whether the
engine said 40 or 255.

Three measurements found why, and each one moved the design:

1. **The density target was never the binding constraint.** At a 1.2 s headway
   and an 11 m/s limit, free flow is 5.7 cars per 100 m. `maxDensity` was 40 —
   a car every 2.5 m, shorter than a car. Changing it between 6, 8 and 12 gave
   36 cars every time.
2. **The entry was a plug.** Admitting a car 6.4 m behind another at speed made
   it brake hard, and the slow car it became throttled everything behind it. The
   tail ran at 3.8 m/s while the head ran at 9.1. A car now arrives at the speed
   of the traffic, one full headway behind it, or it does not arrive.
3. **A busy road is not a fast road with more cars on it — it is a slower
   road.** `LOAD_SLOWS`: at a full byte the desired speed is 35% of the limit.
   The density then follows from the speed rather than being imposed on it.

After all three, measured on a 20-tile street:

| engine load | cars per 100 m | mean speed |
| --- | --- | --- |
| 40 | 1.9 | 9.6 m/s |
| 128 | 6.1 | 6.0 m/s |
| 255 | 8.0 | 3.2 m/s |

Both numbers now track the load, which is the whole point: a jam has to read as
a jam and not as a longer line of cars going the same speed as an empty street.

### Measured

- `./test.sh` **621 tests, green twice**; 14 new in `test/cars.test.js`.
- **Twelve gates green.** No hash moved.
- On a 64×64 with 297 buildings, 973 commuters and a mean road load of 66:
  **997 cars**, `traffic.update` **0.09 ms** a step.
- On a 128×128 with 2,036 buildings and 3,437 commuters: **3,660 cars**,
  `traffic.update` **0.5 ms** a step.
- The frame delta from drawing them is +0.9 ms on both, which under SwiftShader
  is inside the noise; the honest number is the CPU one above.
- A car is **82 triangles measured**, so a thousand of them is 82k — which is
  why they are a ladder rung and why the ladder drops them at a wide zoom on a
  saturated map (`cars dropped for budget` at span 24, kept at span 12 where a
  player would be looking at them).
- `?life=0` freezes them: two `screenshot.mjs` runs of one city are **byte
  identical**, which is what lets every picture gate keep working.

### What failed on the way

**I overwrote `test/traffic.test.js`.** The hand-off names that file for V1's
tests and it already held the ENGINE's traffic tests — the monthly commuter
assignment. Caught by reading the diff stat (240 insertions, 124 deletions on a
file I thought was new), restored from HEAD, and the new tests live in
`test/cars.test.js`. Two different things with one name.

**The first fixture grew no city.** A grid of roads and 898 zoned tiles produced
zero buildings after 1,200 ticks, because nothing was connected to power or
water. The probe now places homes and jobs directly and calls `trafficPass`,
which is the shape `test/traffic.test.js` already uses to exercise the engine's
own commuter pass — a real load field, without having to run an economy to get
one.
