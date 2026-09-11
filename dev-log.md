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

---

## V3 — Ground that is not a checkerboard

`client/world/ground-colour.js`, pure. The rule is not "blend everything":
blending the built land would take the grid away, and the grid is what makes a
city legible. **Natural ground blends; anything a player has put there does
not.** A corner shared by four untouched tiles takes their mean; a corner
touching a road, a zone or a building keeps its own tile's colour.

Two cheap signals on top, both from Higashiyama's `groundColorAt`: a per-tile
mottle of ±6% lightness so a field is not one flat sheet, and a
distance-to-street tone that darkens and desaturates open country by up to 12%.
Neither touches built land. `ground.blend: 0` reproduces the old picture
exactly, which is the escape hatch and what makes the change reviewable.

### A deviation from the work item, with the measurement

The item says to use `model.nearestCorridor` with a chunk-level cache and to
keep the rebuild under 15 ms on a 128×128. Built that way it measured **16.6 ms
against a 10.2 ms baseline** — the corridor query is about a microsecond and
there are 5,404 natural tiles.

It is also more precision than the answer needs. `urbanReach` is 40 m and a tile
is 20, so the whole falloff is two tiles wide and the colour it feeds is per
tile anyway. A flood outward from the road layer, stopped after two rings, is
exact at that granularity and costs one pass over the map. **11.6 ms**, and the
colour source no longer needs the model at all. Recorded as Q28.

### Measured

- `./test.sh` **639 tests, green twice**; 11 new in `test/ground-colour.test.js`.
- **Twelve gates green.** No hash moved.
- Full terrain rebuild on a saturated 128×128, median of five:

  | | ms |
  | --- | --- |
  | V3 off (`blend 0, mottle 0, farTone 0`) | 10.2 |
  | blend only | 11.2 |
  | everything on | **11.6** |

  So the whole slice costs 1.4 ms on the largest map, against the item's 15 ms
  budget and N30's ~12 ms baseline for the same rebuild.
- Triangles unchanged at every span — this is vertex colour, not geometry.
- `reports/smoke-V3-{before,after}-span{default,24,12}.png`. The shoreline is
  the clearest read: a stair-stepped boundary of flat green, sand and blue
  becomes a graded shore, while the road grid and the zoned blocks beside it are
  pixel-for-pixel as crisp as they were.

### What failed on the way

**`client/world/` imported `client/render/`.** The first version reached for
`TERRAIN_COLOURS` as a fallback, which is a layering violation the work items
name explicitly ("`world/` never imports `render/`") and which nothing checked.
The palette is handed in — `createGroundColour(state, palette)` — and
`test/purity.test.js` now refuses the import, verified by planting one.

**Two N30 tests broke, and they were right to.** They asserted that
`terrain.js` reads `tiles.road` and `palette.road`; that logic moved into
`ground-colour.js`, which now owns every question about what the ground is
coloured. The assertions moved with it rather than being deleted: the property
they protect — a road is a colour of the ground, not a quad on it — is the one
that took three slices and a playtest to arrive at.

---

## V4 — Real relief

`RELIEF_M = 0.5` was already in the config and `model.heightAt` already returned
it; what V4 does is make the renderer read it. The terrain mesh, every
instanced pool, picking and the ghost now sample the height field, and buildings
seat on the lowest corner of their lot (ruling 038).

### The flat-layer audit

The full table is in `specs/engine/05-ground-and-streets.md` §5.6, which is what
the review asked for. The short version: everything that stands on a point now
samples at the point it is actually drawn at, everything that spans a tile had
to be decided, and two of those decisions are worth the words.

**The zone tint stopped being a quad.** Seated on the tile's own height it sank
into a hillside; seated on the highest corner — tried, screenshotted — it
hovered as a visible pale sheet over the grass, which reads as a bug rather
than as a tint. It is a colour of the terrain mesh now, exactly as the road
became one in N30, and it follows any slope for free. One fewer pool, 1,209
fewer instances at the default span on a saturated map.

**The overlay wash could not follow it.** It is toggled at runtime and folding
it into the mesh would rebuild every chunk on every switch. It sits at the
**mean** of the tile's four corners instead: on a cliff there is no right
placement for a flat quad, only a least wrong one, and a wash that grazes the
surface reads as a wash while one that hovers does not. Recorded as Q29 to
revisit with E2's chunk cache.

### Picking

`client/world/raymarch.js`, pure, tested against hand-written height fields.
It marches in coarse steps and bisects: the field is continuous and mostly
gentle, so a step of a tile finds the crossing in a few samples and eight
halvings pin it to a centimetre.

The first version marched from the camera and picked nothing at all. The
orthographic camera sits 1,200 tiles out along its orbit so the frustum clears
the map at every zoom — 24 km in metres — so the march ran out of its `far`
limit before reaching the ground, and at a tile a step it would have been over a
thousand height queries for one pointer move. It skips to the band between the
field's own `maxHeight` and `minHeight` first; the whole search is then the few
steps across that band.

### What failed on the way

**A `ReferenceError` that the suite and the first smoke check both walked past.**
`MARK_LIFT` was used and never defined. Road markings are not drawn below 20
pixels a tile, so the default-span screenshot passed and only the span-9 one
hung — and it hung rather than failing, because the harness waits for a flag the
crashed module never sets. Nothing in 639 source-reading tests can see a name
that is missing on a branch they do not execute.

**Two gates were projecting tile centres at `y = 0`.** `play_smoke` and
`mvp_acceptance` each compute where a tile is on screen so they can click it,
and both did it on the plane the map used to lie on. With relief that aims the
click down the slope, picking correctly reports the tile that is actually
there, and the gate calls a working drag broken: six failures in `play_smoke`
and two §24 criteria in `mvp_acceptance`. The third time this session that a
red gate was the gate's own defect.

### Measured

- `./test.sh` **649 tests, green twice**; 10 new in `test/picking.test.js`.
- **Twelve gates green**, including §24's thirteen criteria.
- On `terrainStyle: 'hilly'`, seed 1003: elevation range 39–207, so **84 m** of
  relief, and a 57 m drop inside one 7×7 window. The mesh spans 1.0 to 5.16 tile
  units, which is the model's 19.5–103.5 m divided by `tileM`.
- `play_smoke` on the steepest tile it can find: a click on a 3.3 m drop picks
  the tile it landed on, and the ghost stands within 0.4 tile units of the
  ground under it.
- `reports/smoke-V4-cliff-span10{,-zoning}.png` at an 18° pitch on the steepest
  window: the hillside reads as a hillside, the zoning is painted onto it, and
  nothing floats.

---

## V5 — The perspective play camera

Ruling 034: perspective is the play camera and orthographic stays for the phone.
`view` holds both cameras and swaps which one `view.camera` points at; the
target, yaw, pitch and `span` are shared, so switching projection does not move
the city. That is what makes it a preference rather than a different game.

### What the estimate had to learn

The LOD plan is **per chunk** now — an orthographic camera puts every tile at the
same size and a perspective one does not, so drawing the horizon at the fidelity
of the tile under the cursor is most of a frame spent on things a pixel wide.
`planForChunk` takes the frame's plan and removes what a chunk's own distance
cannot resolve, never adding anything back, so a far chunk can never come out
finer than a near one.

Two consequences, both the P35 lesson again:

**The estimate priced every chunk at the frame's plan** and came out **77% over**
the truth at close zoom. `countScene` now accumulates per-chunk sub-counts
alongside the totals, and `estimate` sums them at each chunk's own plan.

**Terrain was counted against a bounding box.** The box of a wedge holds far more
ground than the wedge, and three frustum-culls the terrain — the same shape as
N30's "charged 49k for ground never drawn". `visibleBounds` returns the
footprint quad as well as its box, and a chunk counts if any of its corners or
its centre is inside. Testing the centre alone under-counted by 40%, which is
the more dangerous direction: the render-and-measure loop corrects an
over-estimate and cannot see the other.

### What failed on the way

**Picking built an orthographic ray.** One direction for every pixel is exactly
right for one camera and exactly wrong for the other, and the error is zero at
the centre of the frame and largest at its edges — which is where a gate does
not look. `groundRay` in `picking.js` is now the only place that knows the
difference, and the controller's pan uses it too.

**`span` means the shorter axis, and I derived the eye distance as if it meant
the vertical one.** Landscape was fine; on a 390×844 phone the camera sat at the
wrong distance and every drag missed. Four `play_smoke` checks caught it —
desktop perspective green, phone perspective red, which is the pair that names
the cause.

### Measured

- `./test.sh` **660 tests, green twice**; 10 new in `test/lod.test.js`, 4 in
  `test/input.test.js`, 2 in `test/settings.test.js`.
- **Twelve gates green**, and `play_smoke` and `budget_gate` now run **both
  projections** — 4 viewport/projection combinations and 2 × 3 tiers × 4 spans.
- **Orthographic is byte-identical to V4** at the default span and at span 12,
  compared against a worktree checkout of `f13b0dd` rather than against memory.
- Per-chunk plans on a saturated 128×128 at span 14: **64 chunks, 3 distinct
  plans**. Orthographic reports 1, by construction.
- Estimate against actual on a saturated 96×96, after the two fixes:

  | | before | after |
  | --- | --- | --- |
  | orthographic | 0–7% | 0–7% (untouched) |
  | perspective | 25–77% over | **1–23%** |

- Draw calls 55 → 91 in perspective: a per-chunk plan means more building tiers
  are in use at once. Triangles bought with draw calls, and both are inside
  their budgets (`plan.md` §6 allows 150).
- `reports/smoke-V5-{ortho,city}.png`, `smoke-V5-city-span14-p20.png` at a 20°
  pitch showing convergence, and `style-sheet-city.png`.

---

## P1 — Toon shading and the anime rig

`painted` has been a lighting-and-palette treatment on Lambert materials since
ruling 022 chose it: a style that differed from `plain` in tint and contrast and
in nothing else. Ruling 017 is the standard — a style is geometry, shading and
palette, and a finish is the least of the four. This is the shading.

`makeMaterial` branches on the style's `shading` field and never on its name,
which is the seam that lets a fourth style exist without touching
`instances.js`. The ramps are a **pure module**, because three cannot be
resolved in node and a ramp that goes backwards or never reaches full light is
the failure worth testing. `NearestFilter` at both ends: a linearly filtered
gradient map interpolates between the bands and the quantisation is gone.

The shadow tint patches `lights_toon_pars_fragment` through `onBeforeCompile` so
the unlit side takes a violet rather than merely darkening. It is the most
brittle thing in the renderer — string surgery on three's own shader — so it
looks for its anchor first and **warns rather than throwing**: a style that
loses its shadow tint looks slightly wrong, and a renderer that will not start
is a game nobody can play.

### Two things found by writing the tests

**The painted palette collapsed for a deuteranope.** Grass and dirt at 0.042
against a 0.045 threshold. Nothing had ever tested a *style* palette — the
colour-vision test covered the sixteen player colours and stopped there. The new
palette separates them by luminance as well as by hue, and the colour model is
now a shared helper rather than two copies of the same arithmetic.

**`shadowRadius` and `shadowIntensity` had been in the rig table since the day
it was written and nothing read them.** The same shape as P35's stale cost
table: a number in a table that nothing consults is a decision nobody took. Both
are wired now, and painted's shadow intensity is 0.72 rather than 1 — a low sun
casts long shadows and at full strength they swallow the cool fill that is
supposed to colour them.

### What the pictures corrected

**Total exposure, not any one light.** The reference rig's intensities are for a
physically-lit renderer; under a ramp they sum past the top of it and every
surface lands on its brightest band. The first shot was a washed-out city with
the form gone. Plain totals about 2.4; the anime rig is tuned to about 3.0, and
the extra is what the cool fill costs.

**And one non-bug chased for too long.** A dark diagonal region across open
ground looked like a shadow-map edge. It was not a shadow: shooting with the
distance-to-street tone at zero changed nothing, and shooting with shadows off
changed nothing — because the `shadows` draw option had never been wired and was
silently ignored. It was **forest terrain**, correctly darker than grass, with
trees standing on it. The draw option is wired now, since a control that does
nothing is the failure ruling 026 is about.

### Measured

- `./test.sh` **683 tests, green twice**; 17 new in `test/toon.test.js`.
- **Twelve gates green.**
- `style-sheet` in both projections: three styles from one city that differ in
  **shading**, not just tint — 55 draws / 83,930 triangles for plain and painted
  in orthographic, 91 / 81,675 in perspective, 1 / 2 for pixel (its post pass
  renders the scene to a target).
- Toon costs **no triangles and no draw calls**: painted and plain report
  identical counts in every frame measured, which is the check the item asked
  for.
- `faceContrastFor('painted')` 1.0 → 0.3; the shadow frustum's extent 0.75 → 0.28
  of the map, four times the texel density at the same size.
- `reports/smoke-P1-painted.png` and `smoke-P1-{plain,painted}-city.png` at a 20°
  pitch.

---

## E2 — The baker and the chunk cache

The machinery the street lane runs on. Four pieces, and the split between them
is the interesting decision: three of the four are testable in node because
three cannot be resolved there.

**`merge.js` is pure arithmetic over typed arrays**, not over three geometries.
`{ position, normal, color, uv, matrix }` in, one set of buffers out. The
failures worth catching are all arithmetic — a matrix applied to positions but
not to normals (every face then lit as though it pointed at the origin, which
does not look broken, it looks slightly wrong everywhere), a colour written per
geometry rather than per vertex, a `uv` present on some inputs and not others.
Ruling 039 said write the addons rather than vendor them; this is 90 lines
against `BufferGeometryUtils`'s 700.

**`chunkHash` covers the buildings' records, not only their tiles.** A lot that
grows a storey changes what is drawn without changing a single tile, so hashing
`buildingId` alone leaves a stale chunk on screen. The chunk's own coordinates
go in first: without them two identical empty chunks share a hash and a cache
keyed by hash hands one chunk's geometry to another.

**The cache builds one chunk a frame, nearest first**, rebuilds only when the
hash moves, and disposes two seconds after a chunk leaves the radius — the grace
is what makes it a cache rather than a thrash when a player pans across a
boundary.

### What failed on the way

**`export { CHUNK } from "…"` does not bind the name locally.** The chunk size
moved into `data/cityviewer.json` (three things key off it and they have to
agree), and `terrain.js` re-exported it without importing it — so every use of
`CHUNK` in that file was `undefined` and the page threw on load. **The suite was
green**: `terrain.js` imports three, so no node test can import it, and the only
thing that can see it is a browser. The third time this lane that a real defect
lived on a path the unit tests structurally cannot reach.

**`streetChunks` is a count, not a radius.** Used as a radius it gave 36 live
chunks where the High tier allows 9 — four times the work, and the number E5's
budget is specified against would have meant nothing.

**The gate's city has no buildings.** Roads and zoning develop into nothing
without power and water, so `model.lots` was empty and the first run baked 36
chunks of nothing: "street chunks are baked at all" passed on 36 live chunks
holding 0 triangles. The check now seeds buildings directly and counts
triangles as well as chunks — a gate that counts containers rather than contents
is a gate that passes on an empty city.

### Measured

- `./test.sh` **703 tests, green twice**; 9 new in `test/merge.test.js`, 11 in
  `test/chunks.test.js`.
- **Twelve gates green.**
- On the budget gate's saturated 96×96 at High, with the placeholder slabs:

  | | |
  | --- | --- |
  | chunks live | **9** (the tier's allowance) |
  | groups / meshes | 9 / 9 — **one draw call per chunk**, one signature in use |
  | triangles | 5,184, so 576 a chunk |
  | build p95 | **1 ms** against an 8 ms budget |
  | rebuilds over six frames of an unchanged city | **0** |

- The placeholder is one slab per lot at `lot.seat`. E3 and E5 replace the
  content; the machinery and these numbers are what they will be measured
  against.

---

## 2026-09-06 — Slice E3: ribbons, and half a city that was culled

The street at L3: a crowned carriageway, kerb faces, pavements, verges, junction boxes, connector
curves, a dashed centre line and the wire runs above them, all draped on the height field and all
baked into E2's per-chunk groups. `client/render/ribbon.js` is the primitive and it is pure —
`ribbon`, `skirt`, `sagCurve`, `dashes`, `clip`, `trim` — with `client/render/streets-l3.js` as the
only part that imports three.

**Measured.** 9 chunks live holding 76,294 triangles, 9 groups / 9 meshes, build p95 7 ms against
the item's 8 ms budget, 0 rebuilds over six frames of an unchanged city. `budget_gate` green on all
32 rows plus the three opening-span rows. Suite green twice; `client_smoke`, `play_smoke`,
`ui_smoke`, `reach_smoke`, `a11y_smoke`, `serve_smoke`, `lobby_smoke`, `save_smoke`,
`mvp_acceptance`, `offline_smoke`, `update_smoke` all green. `surfaceAt` now returns a `y` —
carriageway at `heightAt + 0.02`, pavement a 0.15 m kerb above it — which is what E4's `floorAt`
steps up.

**What failed on the way, in the order it failed.**

*Half the streets in the city were invisible, with a green suite and a rising triangle count.*
`ribbon` flipped a face's NORMAL when it came out pointing down and left the vertex order alone. A
normal is what the shader lights with; the winding is what the rasteriser culls with. So the road
was lit correctly and then thrown away, and which ribbons survived depended on which direction
their corridor happened to run. Poles are boxes and drew fine, which is what made it look like a
colour problem for an hour — I painted the carriageway magenta and floated it five metres in the
air before believing it. `test/ribbon.test.js` now asserts winding against normals for a run in
each direction, and the assertion was verified by planting the old code and watching it go red.

*A one-frame screenshot of an L3 city shows a city with one chunk of street in it.* The cache bakes
one chunk a frame by design, and `tools/shoot.html` drew exactly one frame. `frames=` now draws as
many as asked; the L3 gate shots use 14.

*The bake was 12 ms against an 8 ms budget.* Two causes, both measured. `corridorsIn` returned
whole corridors that merely touched the chunk and built all of them, so most of the city was built
into most of its chunks — `clip` cut that to 9 ms. The rest was `heightAt`, which is a search over
nearby corridors: the cross-section asked it thirteen times per centre-line point. Sampling once
per point and sharing it took the p95 to 7 ms.

*The estimate under-counted the perspective frame by 35–41%.* The street term was inside
`estimateOne`, which under perspective runs once per chunk with `groundChunks: 0` — so it was
either multiplied by the chunk count or zeroed. Baked chunks are a count around the camera, not a
property of a chunk being priced: the term now goes in once per frame on both paths, capped at the
number of ground chunks in view (a baked chunk outside the frustum is culled like anything else).
That is the fourth time in this project an estimate has failed to price what the renderer draws.

*Then `ortho medium span 40` read 78,776 against an actual of 37,504.* Not a new fault: with the
street cost added, the ladder ran all the way to dropping trees for the first time, and at the
bottom the estimate's floor is twice the truth, because the ortho bounds are a square of the view's
diagonal while three culls per chunk against the real rectangle. The fix was to stop the ladder
needing to go there — **L3 is a zoom, not a tier setting**. The cache had been baking its tier's
quota at every span, so a city-zoom frame paid for kerbs a third of a pixel wide. `choosePlan` now
zeroes `streetChunks` below half the per-chunk `l3` threshold. A parallelogram footprint for the
ortho camera was tried as the direct fix and reverted: `test/lod.test.js` asserts the conservative
square covers every yaw, and it does. Recorded as **Q32**.

*The camera was underground.* Looking at the first street-zoom shot: sky in the lower two thirds
and the underside of the terrain across the top. `applyPose` put the eye `sin(pitch) × distance`
above `y = 0` and aimed it at `(targetX, 0, targetZ)` — on a map with 50 m of relief, a low pitch
is below the hill. The orbit is now around `cornerHeightAt(target)`. This is the P34 "closer to the
ground" view, and it has never worked on a map with hills. **Q33.**

**Looked at, and changed because of it** (the ruling-030 discipline: a green suite says nothing
about what the game looks like). At street zoom the water pipes were a blue staircase painted down
the middle of the road — a pipe is underground, and the baked chunk draws the real poles and wires,
so the instanced pass now skips markings, poles and networks inside a chunk the cache has actually
baked (asking the cache, not the plan: a chunk the plan wants at L3 is not baked until the frame
that bakes it). The carriageway was invisible against a road tile painted asphalt for its whole
20 m, so the chunk lays its own verge out to the tile edge. The pavement and centre line ran
straight across the mouth of every side street, so everything kerbside is `trim`med back to the
junction box while the carriageway runs through.

Markings are dashed ribbons, not the canvas §5.3 specifies (**Q31**). `reports/smoke-E3-street.png`,
`-junction.png`, `-slope.png`.

---

## 2026-09-06 — Slice E4: the street camera, and a gate that was measuring a field

A third camera mode in which **the camera is the walker**. `client/life/walker.js` owns a pose in
metres and takes its time as a delta; `client/world/collision.js` is every lot as a solid box in an
8 m spatial hash; `scene.js` copies the pose into `view.eye` each frame and `camera.js` points the
perspective camera out of it. Neither half knows the other exists, and neither imports three — so
every way a street camera goes wrong is an assertion here rather than a walk around the city.

**Measured.** `walkthrough`: 8,907 legs, **161 km** walked down every carriageway and both
pavements of a saturated 96×96 — **0 unfinished, 0 refusals, 0 cliffs**, steepest ground 0.86 m
over 2 m — plus all 1,127 lots walked into head-on with **0 entered** and **395,230** steps pushed
back by the collision world. `passability`: 32,659 samples, 8,461 enclosed on both sides, narrowest
street **26.00 m** against a 20 m right of way and a walker needing 0.88 m. `play_smoke` enters and
leaves by key and by wheel on desktop and phone × orthographic and perspective. Suite green twice;
`budget_gate` and the other ten gates green. 19 new unit tests.

**What failed on the way.**

*The gate was measuring a field.* The first `walkthrough` walked every corridor centre line, 54 km
of it, and reported a clean sweep — with **zero** steps blocked by anything. Ruling 035 puts an 8 m
carriageway and 2.5 m pavements inside a 20 m right of way, and lots are set back beyond that, so
the nearest wall in the whole city is seven metres past the kerb: walking the streets never touches
one. The gate now walks the pavements too, then walks head-on into every building, and **fails if
`walker.blocked` is zero** — the instrument checks itself before the reading is believed.

*A segment push-out does not know which side of itself it is on.* The colliders were four wall
segments per lot, as the work item specifies. A walker 0.2 m inside a building was pushed to 0.34 m
inside it, because the push is away from the nearest point on the segment and that direction is
inward from inside. Lots are rectangles and a rectangle knows its own inside; they are boxes now.

*`floorAt` was measured seven metres away.* The first `surfaceAt` test asked about a point beyond
the frontage, got `ground` at y = 0 and compared it to a road at 0.02. Not a code defect — a test
written without checking what it was standing on.

*The budget was measured from a camera fifty metres above the player's head.* `tilePixels` and
`visibleBounds` both derived the eye from `span` and the orbit, which in street mode is an orbit
that no longer exists. `lod.js` gained `eyeOf(view)`, one answer for both modes. And a near plane
of 0.5 **tiles** is ten metres — from eye height it clips the pavement, the kerb and the front of
the building you are standing next to — so the planes are per mode now, with the far plane pulled
in to where the fog already is.

*`play_smoke` had no street to stand in.* Everything above it in that gate builds a road and then
undoes it, so `enterStreet` was correctly refusing to put the player in a field and the gate was
reading that as a broken key. It lays a street first now. It also found the asymmetry that fixed a
real defect: on desktop the pointer had been left over open ground, and entering from a hovered
tile with no pavement gave up instead of falling back to the middle of the view.

**Looked at, and changed because of it.** Arriving in street mode put the eye in the middle of the
carriageway facing across it: `enterStreet` offsets away from the corridor, and the offset is zero
when the tile you picked *is* the road tile. It now steps to the kerbside on the camera's own side
and faces along the street.

Three deviations: the walker is in `client/life/` rather than `client/render/` (**Q42**), colliders
are boxes rather than wall segments, and look is by drag rather than pointer lock (**Q43**). The
walkthrough also turned up that nothing grades a road along its length — 37% streets on the gate's
own city (**Q41**). (These three were written down as Q34–Q36 and renumbered in E5, which is when
the collision with three planning questions of the same numbers was noticed.) `reports/smoke-E4-{street,pavement}.png`.

---

## 2026-09-06 — Slice E5: facades, and a budget that was a prediction

Every lot in a baked chunk is now built at its real size on its real lot from a generated spec:
walls with real holes in them, reveals built outward so an opening has shadow in it, a ground band
and a stringcourse, five roof forms with eaves, lamps and hedges and a path to the door, and a
Canvas2D fascia over every shop. `facade-spec.js`, `facade.js`, `roof-kit.js`, `props-l3.js` and
`solid.js` are all pure; `signs.js` is the only part that touches three or a canvas.

**Measured** on the saturated 96×96 at High with 9 street chunks: **25.7k triangles a chunk**,
8 live holding 205,864, **2 meshes a group**, build p95 **6 ms** against an 8 ms budget. A facade
is 700–1,100 triangles — a five-storey shop 1,136, a house 862, a shed 712, a civic block 438. All
32 budget rows green, `walkthrough` and `passability` still clean, suite green twice, every gate
green. 36 new unit tests.

**The budget was a prediction and this is the measurement that replaces it.** 200k at High was set
in V2, before L3 existed. Nine chunks of real facade is 200k on its own, so the ladder was selling
the props and the cars to pay for the buildings behind them — a street frame at High measured
~316k with the whole ladder spent. The tiers are now **320k High, 140k Medium**, Low unchanged at
40k because Low has no street chunks. Recorded as **Q37**. `ui_smoke` had its own copy of all three
numbers written into it and went red; it reads `data/cityviewer.json` now, which is the third time
this project has found a gate carrying a stale copy of a number.

**What failed on the way.**

*A chunk bake went to 15 ms against an 8 ms budget* — a visible hitch every time the player walks
into a new block. Three things: every piece was wrapped in a `BufferGeometry` to hand the baker
arrays it was about to read anyway (`baker.addPart` now takes the buffers), the sink was a JS array
taking half a million `push` calls a chunk (a growable `Float32Array` now), and after both it was
still 15 ms. The fix is that **a bake is two phases on two frames** — the street pass and the lot
pass — with the group published when both are done. p95 6 ms.

*A wall was a grid where it should have been bands.* Splitting a face at every opening's coordinate
in both axes gives 77 quads where 31 will do. And a reveal was emitted with both windings, which
doubled the cost of every window in the city for a face nobody can see.

*The estimate was 51% over at close zoom.* The street term was capped at the number of GROUND
chunks in the footprint — terrain chunks, whether or not a street had ever been baked there — so a
close view was charged for six blocks of facades that did not exist. It is capped at the number of
baked chunks the camera can actually see, which `scene.js` now counts against the same footprint
the terrain uses. Fourth time in this lane, and the fifth variation on "an estimate that does not
price what the renderer draws".

*The purity test went red on the word "window".* `client/world/facade-spec.js` says "a window is a
window." in a comment and the DOM ban is `/\bwindow\b/`. The answer to a false positive in a rule
like that is never to weaken the rule: the scan strips comments first, and the pattern now wants
`window.` or `window[`.

*A whole high street read its signs back to front.* The fascia quads took their normal from their
own cross product, which pointed into the building on every edge, and a double-sided material
showed the back. Fixing the normal was not enough — the facade's edges run anticlockwise round the
lot seen from above, so "along the edge" is screen-LEFT to a reader standing outside, and `u` has
to run from 1 down to 0. Worked out on paper after guessing twice.

**Looked at, and changed because of it.** The L2 instanced box was still drawn inside baked chunks,
which is the same house twice with z-fighting on every face. And the two levels each had their own
copy of the family-colour expression: they now share `familyColour`, because a review check that
two copies agree is weaker than not having two copies (which is what the item asked for, done the
other way round).

`reports/style-sheet-street.png` shoots all three styles from the pavement; `reports/smoke-E5-*.png`.
Q37 (the budgets), Q38 (pure modules in `render/`), Q39 (the two faces nobody sees). E4's three
questions had been given numbers Q34–Q36, which three planning questions already held; they are
Q41–Q43 now, and `test/docs.test.js` — which compares the open list in `plan-v1.md` against the one
in `dev-questions.md` — is what caught it.

---

## 2026-09-06 — Slice E6: night, and a prop pass that had been building nothing

Three presets — `day`, `sunset`, `night` — in `data/cityviewer.json`, interpolated over a second
by `client/render/time-of-day.js`, which is pure and takes its time as a delta so `?life=0` freezes
the hour along with the traffic and the walker. A preset **scales** the rig rather than replacing
it: `key`, `hemi` and `sunHeight` are factors on whatever `lightingFor(style)` said and only the
colours are absolute, so dusk is dusk in all three styles and none of them stops being itself
(ruling 017). A rig with no key keeps no key — `pixel` is unlit and a time of day must not switch a
sun on in a style that has never had one.

Night is what pays for L3. E5's emissive buckets come on, the fascias and the shopfronts light,
and `night-lights.js` gives the tier's few point lights to the lamps nearest the eye — nearest
first, with six metres of hysteresis, because a light that appears and vanishes at 60 Hz is a
strobe rather than a lamp.

**Measured** on the saturated 96×96 at High: a night frame is **266,538 triangles of 320,000**
with 44 draw calls, **8 lamps lit of 269 held**, the ladder at "detail dropped for budget". The
overlay bands' nearest pair is **122 apart in 8-bit RGB by day and 41 at night** against a floor of
30. Suite green twice; `budget_gate` gains four night rows, `a11y_smoke` two, `ui_smoke` six; every
gate green. 23 new unit tests.

**The prop pass had been building nothing since E5.** `bakeLots` called `corridorsIn` with five
arguments where it takes six, so `trim` was handed `undefined` as its junction distance, every
kerbside point came out `NaN`, `clip` dropped all of them, and `buildProps` was handed an empty
list. No error, no red test, and a screenshot that looked right because the lamps in it were the
L2 instanced poles standing in the same places. What found it was the night rig asking a question
the renderer had never asked before — *where are the lamps* — and getting 0. The lesson is not
about the argument: it is that a pass which returns nothing looks exactly like a pass whose
conditions were not met, and the only thing that separates them is something downstream that needs
the output for a second purpose.

**What else failed on the way.**

*The sky stayed daylight blue at night.* The dome is a 1,800-tile sphere and street mode's far
plane is 100, so at eye height the sky is entirely behind it and what the player sees is the
renderer's clear colour. Both move with the hour now. And the dome is TINTED rather than rebuilt —
its gradient is baked into vertex colours, and a basic material multiplies them by `material.color`,
so the ratio of the hour's sky to the palette's keeps the gradient's shape.

*The gate measured the frame after the one it set up.* `budget_gate` called `renderer.draw({time:
"night"})` directly and then waited for two animation frames — during which the page's own loop
drew again with whatever the SETTING said, pulling the sun back up. It goes through the session
now, which is the only way a gate that shares a page with a running game can mean anything.

*The first night contrast check measured the wrong thing.* WCAG luminance ratio on four overlay
colours that are told apart by hue: the worst adjacent pair is 1.29 in broad daylight, so any
threshold either failed the palette the game has always shipped or proved nothing. It measures
distance in 8-bit RGB instead, with the floor set from the measurement and written down.

*A lamp blew out the pavement.* At 1.6 intensity a player standing under one lost the shopfront
behind it to white. 0.7 over 30 m.

Q44 (a preset scales the rig), Q45 (48 ticks a day, deliberately not in `data/`), Q46 (the pool
follows the eye). `reports/smoke-E6-{night,sunset}.png`.

---

## 2026-09-06 — Slice P2: ink and grade, and a budget that was measuring a quad

`painted` has the finish it was named for. P1 shipped it with no post pass and said why: a
screen-space **luminance** edge test fires on every window, sill and roof tile, and with L3 facades
in front of it the image turns to mud. The **second difference of linearised depth** does not — it
is zero across any plane at any angle — so a wall of windows draws no lines and the roofline
against the sky draws one. That is the whole argument for the pass and it is what
`reports/smoke-P2-{ink,noink}.png` photographs: the same street with one difference, and no ink
anywhere on the road at a grazing angle.

Shader sources and the grade table are in `client/render/ink-shaders.js`, which imports nothing, so
node reads them: the tests assert that the edge test is a Laplacian rather than a gradient, that
depth is linearised first with an orthographic branch, that the line is divided by the distance,
that convex and concave are separate strengths, and that every uniform the shaders declare is one
the pipeline sets. A shader is a string until the GPU sees it, and everything that goes wrong with
one is silent.

**The budget had been measuring the full-screen quad.** `renderer.info.render` is reset by every
`render()` call, so reading the counter after a post pass gives two triangles and one draw call.
The render-and-measure loop — the thing that makes the budget a promise rather than a hope — has
believed that for as long as any post pass has existed. The `pixel` ladder never stepped down; the
style sheet has printed "pixel — 1 draw, 2 tris" in its own caption in every run since that style
shipped, next to two styles reporting eighty thousand, and nobody read it as a bug. Both pipelines
snapshot `sceneInfo` between the scene render and the passes now, and `budget_gate` checks that the
number is the city's.

**What failed on the way.**

*The shader did not compile for three runs and the picture just looked unfinished.* `vec2 step =
uTexel * uWidth;` shadows the GLSL builtin `step()`, which the same shader then calls. three logs
`Fragment shader is not compiled` to the console and otherwise swallows it: the material draws
nothing, the pass does not happen, and what you get is the scene without its finish — which is
exactly what "the ink is too subtle" looks like. Found by printing every page problem instead of
the first two. `test/render.test.js` now refuses a local named after any builtin the shaders use.

*A backtick in a GLSL comment.* Twice. The shaders are template literals and a comment reading
"a line is \`uWidth\` texels wide" ends the string.

*The line was a grey haze.* At one texel over a 1.5× supersampled target the ink is less than a
device pixel and averages away in the downsample. Three texels.

*Convex and concave were the wrong way round* — every roof ridge drawn as heavily as the roofline
and the roofline faintly, which is the picture upside down. Worked out from the sign of the
Laplacian rather than by swapping and looking.

*The gate could not reach the style it was gating.* `painted` is chosen at boot because it decides
the materials, and nothing in the game selects it — ruling 033 names it as the target and there is
still no control. `?style=` joins `?seed=` and `?life=0` in the URL config so the gate can load it;
whether it should be a setting is **Q47**, and that is Kjell's call rather than a slice's. A first
attempt guarded the whole painted block with `if (painted.style === "painted")`, which meant it
silently reported nothing when the style did not load — the one case worth hearing about.

Q47 (should the render style be a setting), Q48 (two passes where the spec said three).

---

## 2026-09-06 — Slice V6: six silhouettes, fourteen roofs, and a number written down twice

The city at city zoom stops repeating. Six silhouettes per category instead of four, fourteen
house roofs instead of eight and six flat ones instead of four, and residential boxes set back from
the street so there is a front garden with a hedge on the lot line and a path to the door.

**Measured.** `client_smoke` hashes the vertex positions of every variant of every category:
**6 distinct silhouettes of 6** in all four, where before V6 it was 4 of 4 with commercial and
industrial each carrying a clone. On the 64-tile fixture at a wide zoom: 198 lawns, 71 hedges,
71 paths. Suite green twice; `budget_gate` (including its night and painted rows), `walkthrough`,
`passability` and the other ten gates green. 8 new unit tests.

**It was not pure content, which is what the item called it.** Three things had to change first.

*`VARIANTS` was written down twice.* `client/world/params.js` picks a building's variant with it;
`client/render/building-kit.js` built a pool per variant from its own copy of the same number.
Raising one and not the other makes `pools[kind + variant]` come back `undefined` and every
building of the new variants silently stops being drawn — the lawn still there, the house gone.
The kit imports the model's number now, and `test/kit.test.js` refuses a second declaration.

*Two categories already had a clone.* `variant === 0 || variant === 2` in both commercial and
industrial, so those categories have had three silhouettes for four variants since the kit was
written. "Two more" was three more there.

*A front garden is a setback.* The L2 box fills its tile, so the first hedge and path landed
underneath the house — 37 instances drawn correctly and invisibly. Residential boxes are set back
by `lot.setback.residential`, the same 3 m E5's facade already leaves, so the box and the facade
agree slightly better than before rather than worse.

**What failed on the way.**

*A duplicate-silhouette check on triangle COUNTS has false positives.* Residential 1 and 5 are
different shapes with the same 316 triangles. It hashes positions.

*A `str.replace` that does not match is a silent no-op.* The `garden` field never landed in
`buildingParams` — the text I searched for was not the text in the file — and the pools reported
`hedge: 0, path: 0` for two runs while everything else looked right. The instrument that caught it
was the pool counts in the shot report, which are now permanent for exactly that reason: a pool
that is empty looks like a pool whose conditions were not met.

*The screenshot harness hid a page error behind a timeout.* `waitForFunction` timing out after two
minutes says nothing about why the page never became ready; it reports what the page said now, and
the first thing it said was `TypeError: g.getAttribute is not a function`.

Q49 (is a hedge worth drawing at L2 — kept, and first to drop), Q50 (the L2 box and the L3 facade
do not share a footprint, deliberately). `reports/smoke-V6-{city,suburb}.png`;
`reports/style-sheet.png` re-baselined.

---

## 2026-09-06 — Slice R1: the review's eight findings

All eight, each with a test or a gate row that can see it.

**1. Cars were posed everywhere and counted everywhere.** `traffic.pose` walked every car in the
city and `counts.cars` counted every car in the city; on a saturated 128×128 that is 3,660 cars at
82 triangles against a budget of 200k, so the ladder dropped the cars at every zoom and the pools
carried the cost anyway. Both take `bounds` now and answer for the same set, which a unit test
holds them to.

**2. Moving cars were invisible when no parked car of that variant was in view.** The moving cars
go into the same pools as the parked ones and they go in AFTER `updateInstances` has written
`visible = mesh.count > 0`. The pools are settled again after the pose, and the cars' triangles go
back into the frame's own count of itself — the number the ladder spends against.

**3. A car in a junction took a stranger's speed.** `desired.get(link.kind === "block" ? link.id :
link.from)` — `link.from` on a turn link is a NODE id and `desired` is keyed by LINK ids. The
desired speed is carried on the car as `car.v0` now. This one has no behavioural test and the
reason is worth writing down: the two key spaces overlap, so the wrong answer is a plausible speed
rather than a wrong one, and a car crosses an 8 m junction box in well under a second, so nothing
measurable about its position changes. It is asserted against the source, and `car.v0` is now
observable so the next question about it can be answered.

**4. The governor's `supersample` rung did nothing and `pixel` was not on the ladder at all.**
`allows("pixel")` was always true, so the one post pass a phone actually runs could never be given
up and the ladder's first rung was a pass no tier below High even has. `pixel` goes first now, and
`applyGovernor` reads `allows("supersample")` and steps the pixel ratio down to 1.

**5. `worldChanged` cleared the street cache.** Every build action threw away nine baked chunks and
re-baked them one a frame — six frames of L2 after every road tile painted. `chunkHash` exists
precisely so that only the chunk that changed is stale; the cache is told the model moved and drops
the bake in flight, and `nextBuild` decides the rest.

**6. The camera and the budget disagreed about where the eye is.** `client/world/orbit.js` is new
and pure: `verticalSpan`, `eyeDistance` and `eyeOf` in one place, called by `camera.js` and
`lod.js`. `applyPose` is eight lines now and handles all three modes. `picking.js` branched on
`view.mode === "city"`, which made street mode build an orthographic ray — the constraint the
review left for E4 and the one thing of it still outstanding.

**7. `scene.fog = new THREE.Fog(...)` every frame.** Mutated.

**8. The model rebuild, measured on a 128×128.** **80.0 ms** — corridors 7.7, ground 0.3, lanes
**53.0**, lots 25.0; 38.7 ms on the 96×96. Over the one-frame threshold the finding named, so the
per-chunk derivation E0 deferred is now due. That is a slice rather than a fix and it is **Q51**,
recorded with the split so the next person starts at the lane graph rather than guessing.

**Measured.** `budget_gate` gains three car rows on a live page (`life=1`, which the frozen budget
page cannot be): **15 cars in the pools, 6 moving in the city, no pool hidden with cars in it**.
Suite green twice; every gate green. 12 new or changed unit tests.

**What failed on the way.** Four tests in `input.test.js` and `render.test.js` asserted against the
old shape of `camera.js` and `picking.js` — a source test is a model of the code, and moving the
code is exactly when it has to be read again. And the first two attempts at a behavioural test for
finding 3 both passed with the bug planted, which is how it became a source assertion instead: a
test that cannot fail is worse than no test, and saying so in the file is the honest version.

---

## 2026-09-06 — Slice R2: fourteen review findings, and a fifteenth found doing them

The architect's pass after R1 gave nine findings and the omissions pass five more. All fourteen
have a test or a gate row.

**Measured.** `ui_smoke` 114 → 118 checks — the render style is a settings row now and the gate
drives it through a renderer rebuild. `a11y_smoke` gains reduced motion with a baseline to compare
against (4 cars on a page without the preference). `lobby_smoke` starts three cities in one page
and the geometry count goes **15 → 2 → 2** where before it climbed. `budget_gate` is green with its
street-chunk, car, night and painted rows. The 128×128 model rebuild is **80.0 → 53.7 ms**. Suite
green twice; every gate green.

**The nine.**

1. **A building was a member of two chunks by two rules** — the baker claimed a lot by its centre,
   the instanced pass skipped the L2 box by its anchor tile, so a 2×2 across a boundary was drawn
   twice or not at all. `chunkOfLot` is the one rule.
2. **Signs were Lambert whatever the style** — in `painted` the one surface on the street that was
   not toon-shaded, in `pixel` lit on an unlit city, and dark at night above a glowing shopfront.
   They take `makeMaterial(style)` and a `userData.emissive` mark, so `setNight` dials them.
3. **Leaving the street forgot where you came from** — a phone defaults to orthographic and always
   came back to perspective. `play_smoke` checks the round trip in both.
4. **The day was nineteen seconds long.** Ticks were the wrong clock: at the play speed a tick is
   400 ms, and at fast speed the day was six seconds — the sun raced because the GAME sped up. It
   is `DAY_SECONDS = 240` of wall clock now, held while paused.
5. **The style is a setting.** Ruling 033 named `painted` as the target and nothing selected it;
   by ruling 026's standard two of the three styles did not exist. Default `painted` on High.
6. **Sign names per locale**, equal lengths, so a language change renames every shop and moves
   none of them.
7. **The derivation, profiled and cut.** `deriveLots` searched every corridor for every road-less
   lot; it widens rings now (25.0 → 15.0 ms). `deriveLanes` asked the ground for a height at every
   lane point — 14,780 queries, 23 of its 52 ms — and reads the corridor's own centreline profile
   instead (53.0 → 41.3). **80.0 → 53.7 ms**, still over a frame, and 28 ms of what is left is the
   graph construction rather than the ground: the per-chunk slice stands (**Q60**).
8. **Chunks were baked behind the camera.** The cache filters by the visible footprint before
   taking the tier's count. Also the answer to Q53.
9. **Two `THREE.Color` allocations a frame** in a function that runs twice a frame.

**The five from the omissions pass.** Lamps and parked cars were drawn twice inside a baked chunk
(`props` was not gated on `drawn`, which is why E5's screenshots showed lamps while its prop pass
built nothing); `renderer.dispose()` freed the context and nothing in the scene; reduced motion was
ignored by the renderer entirely; the lobby diorama ran the High tier with live traffic and a day
clock behind a start screen; and three documents had drifted — ruling 040's tier table, the
README's gate list, `specs/engine/08` §8.1 — with `test/docs.test.js` now holding the ruling's
table against `data/cityviewer.json`.

**A fifteenth, found doing them.** `instances.js` kept its own `const CHUNK = 16` — a fourth copy
of the number E2 moved into `data/cityviewer.json` because three things had three copies.

**What failed on the way.**

*A silent blank page for half an hour.* `stillness` was declared below the `createRenderer` call
that read it, so `startGame` threw a temporal-dead-zone `ReferenceError` — and `main.js` awaited
`play()` in three places without a catch, so it became an unhandled rejection with no console
output at all. `client_smoke` stayed green throughout, because it drives `tools/shoot.html` and
never loads `index.html`. `play()` is caught now and says so on screen.

*The reduced-motion check had a baseline of zero.* "0 cars with the preference, 0 without" passes
and proves nothing; the gate lays a road with traffic on it first. And the check itself changed:
`life: false` settles the street and stops the clock, so what is asserted is that no car MOVES,
not that none exist (**Q59**).

*The budget gate quietly changed what it was measuring.* Making `painted` the default on High
meant the gate's own page was rendering the ink finish, and every number in its history was taken
on `plain`. It pins `?style=plain` now, and the painted rows keep their own page.

## slice-V7 — overlays as a texture on the ground (2026-09-07)

Ruling 041, with the two §2d amendments (A38, A44) and A32.

**What it is.** `client/render/overlay-texture.js` fills a `width × height` byte plane from
`bandAt`, one byte a tile; `terrain.js` owns a shared `RedFormat` / `NearestFilter` `DataTexture`
over it and hands every chunk's material the same four uniforms; `style-assets.js`'s `overlayed()`
patches the terrain material through `onBeforeCompile` to mix `OVERLAY_COLOURS[band]` over the
ground at 0.55. `updateInstances` lost the `ovl` pool — the marks stay — and `estimate` lost its
overlay term. Toggling an overlay is now one upload of 4 KB on a 64×64 and no geometry at all:
`budget_gate` measures **0 extra triangles** with the wash on, against the 24,000 instanced quads
it replaces.

**A38 — the verge takes the ground's colour.** `ground-colour.js` grew `natural(x, y)`: the tile
with nothing built on it. `tile()` cannot answer for a verge, because the verge is INSIDE the road
tile (ruling 035) and `tile()` rightly says tarmac. `streets-l3.js` emits the verge as one strip
per run of spans the ground agrees about, which on most streets is one strip.
`reports/smoke-V7-verge-sand.png` and `-grass.png` are the same frame with the terrain layer
switched: a green verge in one, a sand verge in the other.

**A44 — territory reaches the facades.** `chunkHash(state, cx, cy, territory)` takes the flag as a
salt, so a toggle marks every live chunk stale and it rebakes with `showOwner`; `bakeLots` passes
it through the same `familyColour`/`buildingParams` pair the instanced boxes use.
`reports/smoke-V7-territory.png` and `-off.png`: the near baked half and the far instanced half
agree.

**A32.** Orthographic `tilePixels` reads `canvasHeight / verticalSpan(view)`.

**Measured.** `budget_gate` — overlay on 70,016 triangles against 70,016 off, 38 draws, estimate
68,900; territory toggle 8 rebakes on, 0 while it stays on, 8 coming back off; every other row
unchanged. `a11y_smoke` — on `hilly` at 16° pitch, three shots of one city differing only in the
wash: bands 0→1 **102 apart at the median, 37 in the darkest twentieth**, bands 1→2 **77 and 32**,
against E6's floor of 30. `play_smoke` — the overlay button pressed on four viewport/projection
pairs: 6,042 of 7,540 sampled pixels move with the wash on, **0** keep it after it is switched
off. Suite green twice; `client_smoke`, `ui_smoke` unchanged.

**Re-baselined** `reports/smoke-V7-*.png` (slope zoning/plain, verge sand/grass, territory on/off).
They supersede the V4 overlay-on-a-slope shots.

**What failed on the way.**

*The wash was invisible for three screenshots, and the shader was fine.* Every diagnostic said the
patch had applied — `material.userData.shader` present, `uOverlayOn` 0.55, `uOverlay` in the
fragment source — and the picture did not change. The plane was right too: a histogram of it read
`{0: 3309, 1: 2, 255: 785}`. The city simply had no pollution, so the whole map was band GOOD and
a green wash over green grass is a green picture. `zoning`, which has three bands on that fixture,
showed it immediately. **Verify the instrument, then verify what the instrument is pointed at.**

*The wash failed the accessibility floor.* Mixed into `diffuseColor` — the obvious place, before
the light — the ground's own shading multiplies it, and on `hilly` at a low pitch the darkest
twentieth of the ground separated adjacent bands by **25** against the floor of 30: a slope in
shadow turned amber and red into one colour. Mixing over `outgoingLight` instead makes the
separation the palette's gap times the wash everywhere, and the 45% of the ground that is left
still carries the shading. Found only because the gate reads rendered pixels; the existing overlay
check is arithmetic on the palette and was green throughout.

*The territory gate measured a cache thrashing.* `renderer.draw({territory: true})` from the gate
alternates with the page's own frame loop, which draws without it — so the flag flipped every
frame and the chunks rebaked forever: 15 on, 9 more with nothing changing, 0 coming back off. The
gate wraps `renderer.draw` for the duration instead, which is the renderer's real interface. The
underlying fact is **Q61**: nothing in the game selects territory, so the only thing that can turn
it on is a gate.

*Two harness flags were silently dropped.* `screenshot.mjs` maps a fixed list of named parameters
into the URL, so `territory=1` never reached the page and the shot that was supposed to prove the
overlay reached the facades was a shot of the city without it — with a plausible triangle count.
It takes an `extra` object now. And removing a diagnostic probe from `shoot.html` left a dangling
`}`, which surfaced as a 120-second timeout in `a11y_smoke` rather than as a syntax error, until
the page's `pageerror` was listened for (the V6 lesson, paid for again).

## slice-E7 — people on the pavement (2026-09-07)

Spec §9.3, with both §2d amendments (A43 the furniture is solid, A45 cars yield).

**What it is.** Four new pure modules, none of which imports three, so all of them are testable
in node. `client/world/polyline.js` holds the four operations the lane graph and the nav graph
share — offset a centre line, trim its ends, pack it with heights, sample it — extracted from
`lanes.js` rather than copied. `client/world/nav.js` derives the graph: a **walk** edge per side
of every corridor trimmed a junction box short, a **cross** edge over each carriageway carrying
that node's signal axis, a **corner** edge round each junction, and a lot's **door** as a point
on a walk edge. `client/life/pedestrians.js` fills the pavements; `client/world/street-furniture.js`
holds where a lamp and a hedge are, for both the geometry and the collider.

**There is no route planner, deliberately** (Q62). A person picks a successor edge by a hash of
their own id, exactly as a car picks its turn; the doors decide where people enter and how many.
That gives crowds outside busy buildings, people waiting at a red light and nobody walking
through a wall, for the cost of a hash.

**A43 — the furniture is solid.** Lamps and hedges are boxes in the collision world now, from the
same functions that place the geometry. It moved a constant: a lamp stood at `half + sidewalk / 2`,
the middle of the pavement, which is exactly the line `walkthrough` walks — so with the posts
solid every pavement leg ground to a halt on one every 24 m. `props.lampInset` stands it 0.5 m
out from the kerb instead.

**A45 — cars yield.** `traffic.yieldTo(points, walker)` takes world points once a frame; people on
crossings, plus the player's own walker in street mode. `ahead()` places them on a link through
`nearestCorridor` and the link's own `s0`/`dirSign` — recorded by the derivation, which knew them
— and treats one as a harder wall than a red light. The collision world deliberately never keeps a
person off a carriageway.

**Measured.** `budget_gate` — **42 triangles a person**, so the High cap of 120 is **5,040** of
320,000 against the **53,462** the night frame leaves; 120 held and 63 on screen at street zoom;
the night row is unchanged at 263,388. `walkthrough` with the furniture solid — 8,907 legs,
**161.04 km, 0 unfinished, 0 refusals, 0 cliffs**, 399,901 blocked steps over **5,609 solids**
where E4 had 1,129. `passability` — **0 too narrow**, narrowest **11.14 m** (E4: 26.00, which was
the ceiling before the posts existed), 25,560 of 32,659 samples enclosed on both sides (E4: 8,461).
Suite green twice; all fifteen gates green. `reports/smoke-E7-{street,person,city,night}.png`.

**What failed on the way.**

*A city of houses had nobody on it.* The spawn threshold was the cars' — `here + 0.5 < target` —
copied over without thinking about the units. A pavement outside an ordinary house asks for 0.24
people, and 0.5 is more than that, so it got none; `budget_gate` reported **0 people** while every
unit test passed, because the test fixture used an occupancy of 120 and asked for 1.44. The
fraction is resolved by a hash of the edge now, which is still a function of the state.

*Then 39 of 120 people stood more than 250 m away.* Three separate causes, each found by looking
at a screenshot and each hidden by a green count:

1. The cap was filled in **derivation order**, so it went wherever the graph happened to start.
   Ordering by the visible box fixed nothing on its own —
2. because under perspective at a low pitch the box **stretches to the horizon** and its centre is
   a hundred metres in front of the camera. It orders by the EYE now, which is A39's finding one
   lane along.
3. And "the nearest pavement" is not "the nearest doorway": a corridor is 300 m long, so sorting
   by an edge's first point picked the street underfoot and then put somebody out of a door at the
   far end of it. One person per pavement per step made it worse again — 120 people on the 120
   nearest pavements is the whole city — so each pavement is filled to its own capacity before the
   next.

Every one of those was invisible to `stats.peds`, which counts what is in the visible box; the
instrument that found them was a screenshot with the crowd painted magenta at three times size,
and then a histogram of how far each person was from the eye.

*The frozen crowd settled before the camera existed.* `?life=0` settles and then stops the clock,
and at construction nothing knows where the camera will be — so a frozen city put its whole crowd
wherever the derivation started. It settles once more, lazily, on the first frame that says where
the camera is, and is frozen for good after that.

*The shoot harness had no city to put a crowd in.* A deputy-built 48-tile city is 89 buildings with
a median occupancy of 8; a slice about crowds cannot be looked at on one. `tools/shoot.html` takes
`?dense=1` and builds the same saturated fixture every other gate measures on — 396 buildings on a
64-tile map. It also gained `?pollute=` and `?sand=` in V7 and `?territory=`, and
`tools/screenshot.mjs` passes anything through `extra` now rather than by a named parameter each.

## slice-R3 — streets graded along their length, and hills that stay half a metre (2026-09-07)

A42, both halves; ruling 038 amended with the numbers.

**What it is.** `client/world/grade.js` — pure, 180 lines — smooths a corridor's profile between
its two junctions until no span exceeds `road.maxGrade` (0.15), by cut and fill: a projection
that walks the profile and moves the two ends of any span that is too steep towards each other by
half the excess, leaving junctions where they are. `ground.js` computes one per corridor at
derivation, from `landAt`, and `heightAt` inside a corridor reads it instead of the land. Nothing
else changed: everything that stands on a street re-seats through the one height function.

**Measured, on the saturated 96×96.** Steepest street **37.1% → 18.8%**; the walker's worst
ground jump **0.86 m → 0.40 m** over 2 m; 8 of 773 corridors left over, because their two
junctions are further apart in height than 15% allows over the run between them and node heights
are fixed (A42). `walkthrough` reports both numbers every run now. `passability`, `budget_gate`
and the other thirteen gates unchanged.

**`RELIEF_M` stays 0.5**, and the reason is a table rather than a taste. One seed, twenty years,
three terrain styles, streets graded:

| terrain | relief | tallest ground | cannot make 15% | steepest street |
|---|---|---|---|---|
| flat | 0.5 → 1.0 | 25 → 50 m | 0 → 0 of 2,054 | 5% → 9% |
| rolling | 0.5 → 1.0 | 61 → 121 m | **8 → 256** of 2,095 | **16% → 32%** |
| hilly | 0.5 → 1.0 | 104 → 207 m | 934 → 1,455 of 2,161 | 71% → 141% |

At a metre a step one street in eight on an ordinary rolling map is steeper than the limit Kjell
had just set. `reports/smoke-R3-relief05.png` and `-relief10.png` are the same frame at both, and
1.0 is unmistakably the better picture at city zoom — the town climbs a hillside, the far shore
has hills on it. At street level the same city is a road falling off a cliff with the baked
chunks tearing across each other. A place you can stand in beats a place you can only look at.
`reports/smoke-R3-{ungraded,graded}.png` are the steepest street on the fixture, before and
after: 28.7% → 15.7% at that spot.

**What failed on the way.**

*Grading alone moved the number by 1.6 points.* 37.1% → 35.5%, with every corridor's own profile
at 15.5% or below. The gate was measuring the blended FIELD and the profiles were fine: near a
junction `heightAt` mixes the crossing street, which is pinned to the node height, so a street
still climbing as it arrived was dragged up to meet it over the last six metres. **The profile
obeying the limit says nothing about what anything standing on the street sits on.** Levelling
the junction box — the same box the kerbside already stops short of — took it to 24.1%.

*And then the junction box made two of the three fixtures worse.* A fixed 6.5 m at each end of a
20 m block leaves seven metres to make the whole height change in, so a level junction turned a
17% hill into a 29% street: on a generated rolling city the graded field went 27% → 29% and on
`hilly` 111% → 134%. Capping the box at a sixth of the street fixed it — 37% → 19% saturated,
27% → 23% rolling — and the cap's exact value turns out not to matter (a quarter, a sixth and a
tenth all give the same peak); what mattered was that it existed.

*The before-and-after was measured against the wrong "before" for an hour.* `landAt` along a
centre line is not what `heightAt` used to return: the old `heightAt` blended several corridors,
and the blend is most of the steepness. Comparing the graded field against the bare land said
grading had made everything worse. `?grade=0` in the shoot harness turns the whole thing off,
junction boxes included, so the two can be shot and measured from one page — which is what
produced the table above.

*And `hilly` cannot be graded at any relief.* 43% of its streets are beyond 15% at today's 0.5,
because the land between adjacent junctions is simply steeper than that and node heights are
fixed. Nothing R3 can do; **Q64** asks whether a junction should be allowed to move.

## slice-E8 — water, and a river that follows its valley (2026-09-07)

Spec §5.5, Q58 (now A46).

**What it is.** `client/world/water.js` — pure, node-loadable, and where the tests are — decides
where the water is, how high its surface stands and how deep the bed is under it.
`client/render/water.js` draws the surface and is plumbing. `collision.floorAt` refuses to stand
in it; `surfaceAt` answers the water rather than the bed.

**Three deviations from §5.5, every one of them measured.**

*The level is per tile, not per map.* `waterLevel` was one number — the maximum land height of any
water tile anywhere — so on the `rolling` fixture the surface was 47.5 m while the same river's
lowest tile is at 14 m: a river running down a valley was drawn as a plateau at the height of its
highest tile for half its length. Every water tile carries its own surface now, which makes a lake
level by construction and lets a river step down its valley.

*Not a plane per chunk but one mesh for the map.* A single plane is a single height, which is the
same bug. Per chunk was sixteen draw calls on a 64×64, and `client_smoke` went red at **89 against
its budget of 80** — the check that exists to notice instancing quietly stopping. One mesh is one
call and gives up frustum culling, which costs nothing: **1,570 triangles** for a whole 64×64,
against 512 for a single terrain chunk. The budget is charged the whole map's water rather than
the part on screen, because the whole map's water is drawn.

*Lit, not unlit.* Unlit is the obvious choice — water is a reflection, not a surface catching a
lamp — and it gave a river glowing cyan through a black city at midnight. The colour arithmetic
was right and the space was wrong: three multiplies colours in LINEAR space, so dimming by the
night preset's hemisphere of 0.34 is about 0.6 to the eye, while the lit ground beside it had gone
to almost nothing. A lit material dims by exactly what everything else dims by, without a second
copy of the lighting rules.

**The bed drops, so the shoreline is geometry.** `heightAt` over water answers the bed —
`water.depth` below the surface, flooded outward from the shore over `water.shelf` tiles so a
beach is a beach and not a step the height of the water. `reports/smoke-E8-shore.png` is a shore
from the pavement: sand into the shallows, the surface across the middle, the far bank behind it.

**A46 (Q58).** A causeway is a road at the water's surface, and it works: `surfaceAt` returns the
road where a corridor crosses water, so the carriageway is not on the riverbed, and the water
either side of it is still a wall.

**Measured.** `client_smoke` 72 draws / 79,931 triangles at span 9 (was 70 / 77,271 — one draw
call and 2,660 triangles for every drop of water on the map). `budget_gate`, `walkthrough`
(161.04 km, 0 unfinished, 0 refusals) and the other thirteen gates unchanged. Suite green twice.
`reports/smoke-E8-{shore,night,city,causeway}.png`.

**What failed on the way.**

*A night shot came back with a glowing river, and the material was innocent.* The probe said the
water was `#175c6e` — a dark teal — while the picture showed something far brighter, and the
answer was that the arithmetic dimming it was linear and the eye is not. Then the same shot with
the surface painted magenta showed thin dark seams through it: at the waterline the bed IS the
surface, so a plane at exactly the level is coplanar with the sand and the two z-fight.
`water.lift` puts it six centimetres up, for the same reason `road.lift` exists.

*And the first thing the slice did was find that water had never been level.* The item said "one
transparent plane per chunk, at `waterLevel`" and the first measurement of `waterLevel` — 47.5 m
against a river bed at 14 m — said the plane would flood half the map. **Q65** (should a river be
CUT into the land) and **Q66** (one unculled mesh) are what is left.

## slice-V8 — the street, finished (2026-09-07)

The last item in the cityviewer lane: six things the spec promised and no slice owned.

**Trees at eye height** (spec §6.6). `client/render/trees-l3.js` builds a trunk and a cluster of
faceted blobs into the chunk baker — never a billboard — in three species that differ in shape
rather than tint. WHERE a tree stands moved to `client/world/foliage.js` so both passes read one
answer, and `updateInstances` stops drawing its cones inside a baked chunk: it was the one pass
never gated on `drawn`, which is why a walker was standing under a four-sided pyramid.

**Signal heads and crossings** (spec §9.2, A33). `client/world/signals.js` decides where a head
stands, where the zebra's bars go and which lens is lit. The post and housing are baked; the LENS
is posed per frame from **the same `phaseAt` the cars read**, because two answers to "which way is
green" is a car driving through a red one. Cars have stopped at invisible lights since E1.

**Headlights and tail lights** (spec §9.1). Two unlit quads a car, posed only when `night` is up
— nothing at all by day. `traffic.lampsOf` is exposed as well as posed: "the headlights are on the
front" is not something a screenshot argues about, and a car with them behind it reads as traffic
going the wrong way down the street.

**The minimap knows where you are.** Under perspective it draws the frustum FOOTPRINT rather than
a box round it — a wedge at a low pitch holds several times the ground a box does, so the box was
claiming you could see a great deal you cannot — and in street mode it draws the walker as a dot
with a nose on it. Both from `visibleBounds`, so the minimap and the budget agree about what the
camera can see.

**Street ambience.** `streetAmbienceFor` adds `tiles.traffic` under the walker to a third of the
city's own level: the city is a floor and the road under your feet is what changes. Both numbers
are hashed state, so a muted client stays hash-identical to a loud one.

**Fog and sky in the street.** `client/render/atmosphere.js` — pure — gives the city camera the
zoom-following haze it always had and the street a fixed one in METRES, because a walker's eye does
not zoom and street mode was inheriting whatever span the player had been standing at. And the
dome is scaled to sit inside the far plane: it was a 1,800-tile sphere against street mode's 100,
so at eye height the sky was entirely behind it and dusk was a flat clear colour.

**Measured.** `budget_gate`: street chunks **269,940 triangles over 8** (E5 measured 25.7k a
chunk; a chunk is 33.7k now), build p95 **7 ms** against 8; the night row **289,446 of 320,000**;
the overlay, territory, car and crowd rows unchanged. `client_smoke` 72 draws / 79,931 triangles
at span 9 — three new pools and no new draw call at that zoom. Suite green twice, all fifteen
gates green. `reports/smoke-V8-{street,junction,night,dusk}.png`.

**What failed on the way.**

*The dome became a pale ball sitting in the middle of the map.* Scaling it from 1,800 tiles to 85
was the fix for street mode, and it exposed something that had never mattered: the dome is centred
on the world origin, not on the eye. At 1,800 tiles the camera is always near enough to the
centre; at 85 it is not. It follows the camera now.

*Three separate things were paid for in buildings.* The night frame's ladder is the instrument
here, and it moved twice. Seven-sided tree blobs put 21,336 triangles into eight chunks and took
it from "detail dropped" to "silhouettes only"; five sides put it back. Then the signal lenses —
a 6×4 sphere is 36 triangles for something two pixels across, three hundred of them — took it down
again; an octahedron is eight. The frame is 289,446 of 320,000 and the ladder is at "silhouettes
only" for the DISTANT city at the hour it is least visible, which is the trade it exists to make
(**Q68**).

*A page that merely got slower looked exactly like a page that threw.* `screenshot.mjs` waited on
`goto`'s `load`, which for a module script means the whole of `shoot.html` — generate a city, grow
it twenty years, draw forty-four frames — against a 30-second default with no page error attached.
It waits on `commit` now and lets the page's own readiness signal, which has two minutes, be the
gate.

*And drawing the lights found something that had been true since E1:* every junction on an
ordinary city grid is signalled, so a street at eye level is a picket fence of traffic lights
(**Q67**). The cars have always stopped at all of them.

## slice-R4 — the lane that read its street backwards (2026-09-08)

The review after V8 (§2f). Three items; the first is the largest number the lane left in the
code.

**1. Every lane running against its corridor read the corridor's profile mirrored.** R2 gave the
lane graph the corridor's own centreline profile instead of a `heightAt` per lane point — the
change that took the model rebuild from 80.0 ms to 53.7 — and mapped a lane's own fraction of
length onto a profile built in FORWARD order. A lane with `dir === 1` runs the corridor
backwards, so its start, at the corridor's far end, took the near end's height. Measured on the
saturated 96×96 with buildings off, every packed lane point against `heightAt` under it:

| links | points | mean error | over 0.5 m | worst | after R4 (mean / over / worst) |
|---|---|---|---|---|---|
| block, `dir 0` | 3,742 | 0.05 m | 0 | 0.44 m | **0.00 / 0 / 0.11 m** |
| block, `dir 1` | 3,742 | **1.79 m** | **2,540** | **12.44 m** | **0.00 / 0 / 0.11 m** |
| turns | 29,848 | — | — | 12.44 m | **0.00 / 0 / 0.25 m** |

Half the traffic in the city was posed against the wrong end of its street: on a street that
climbs twelve metres the cars going up it drove twelve metres underground, headlights and all.

**Two fixes, not one.** The mirror is the mapping by ARC LENGTH along the corridor, using the
`s0` and `dirSign` the link already recorded for E7's yields. That left 0.7 m near every junction
— because `profileOf` was re-sampling `heightAt` at the corridor's own twenty-metre points, and
R3 put structure between them: the junction box at each end is level, and interpolating across
20 m walks straight over it. It reads R3's graded profile itself now, which is also one
derivation fewer: `deriveLanes` takes the whole `ground` rather than just its `heightAt`.

`tools/lanes_dump.mjs` prints the lane-to-ground error every run and fails over 0.3 m, so this
cannot come back quietly.

**2. `budget_gate`'s tier rows reported the previous tier's budget.** The check read
`stats.budget` straight after `setQuality` and before any draw — `stats` is filled by `draw` — so
the log said `low … 320000`, `medium … 40000`, `high … 140000`, each one the tier before it, and
the assertion was on the tier NAME only. It draws once first and asserts the budget against
`data/cityviewer.json`'s own table now: 40,000 / 140,000 / 320,000.

**3. `traffic.placeYield` scanned every block link for every yield point, every step.** Indexed
by corridor id once at construction. Measured by `lanes_dump` on the saturated 96×96 with 400
cars and 120 yield points: **0.44 ms a step → 0.22 ms**. With no yields it is 0.11 ms either way.

**Measured.** Suite green twice; `lanes_dump`, `walkthrough`, `passability`, `budget_gate` and
the eleven browser smokes green. No fixture hash moved. `reports/smoke-R4-{before,after}.png` is
the same steep street on `hilly` with the mapping off and on.

**What failed on the way.**

*The screenshot pair is the weakest evidence in this slice, and it took three attempts to get one
at all.* The first frame had no cars in it; the second had 8,831 in the city and none on screen,
because 8,831 × 76 triangles is over any budget and the ladder had dropped them; the third needed
the engine's commuter load set by hand, because the saturated fixture pushes its buildings in
directly and never runs a commuter pass — a fixture with no traffic on it is the wrong place to
photograph a traffic change. `tools/shoot.html` takes `?traffic=N` now, and
`tools/screenshot.mjs` takes an `__init` script so a before and an after can be shot from one
harness with the code change toggled — the R3 lesson, made reusable. Even so: **the number is the
evidence here, not the picture.** 12.44 m of error is invisible from a hillside at a hundred
metres and obvious in one line of `lanes_dump`.

## slice-T1 — signals only where two real streets cross (2026-09-08)

A51, answering Q67. V8 drew the signal heads and showed what E1's rule meant on an ordinary
city grid: every node of degree three or more was signalled, so a residential street at eye
height was a picket fence of traffic lights.

**The rule.** `isSignalled(node, corridors)` in `client/world/signals.js`: four arms, and a
corridor of more than one tile on each axis. One function, asked by the lane graph that owns the
cycle, the heads that stand at it (V8) and the nav graph's crossings (E7) — three copies of it
would be a light standing at a junction the cars drive straight through.

| city | junctions | signalled before | after |
|---|---|---|---|
| saturated 96×96 (`lanes_dump`) | 372 | 372 | **337** |
| deputy, rolling 64 | 1,126 | 1,126 | **41** |
| deputy, hilly 64 | 1,181 | 1,181 | **39** |

The saturated fixture keeps 91% of its signals because it genuinely is a grid of long streets
crossing long streets; the deputy city — which is what V8's picket-fence screenshot was of —
drops to 4%. `reports/smoke-T1-{cross,tee}.png`: a signalled crossroads, and a residential T at
eye height with lamps, trees, cars and no heads at all.

**Give way.** Everything else holds priority by axis: the through road is the axis with two arms
(a junction splits the road running through it into two corridors and leaves the road that ends
there whole, so "the longest street has priority" hands the right of way to the side road — that
was the first version and it was backwards). A car on the minor arm treats the junction as a hard
stop until nothing on the through road is within `road.speed × 2` seconds of the box. A tie is
nobody: two equal streets crossing unsignalled is a place the rule cannot resolve, and stopping
both is a deadlock. Pedestrians at an unsignalled crossing ask the cars for the same gap
(`traffic.busyAt`), wired in `scene.js` because the two simulations may not reach into each other.

**`traffic_gate 200 25`, both runs, side by side — and they are identical:**

```
before   923 buildings (629 homes), 8899 road tiles, pop 7048
         traffic pass: median 0.59ms, worst 0.62ms
         summary: {"commuters":1263,"congested":364,"stranded":161,"averageCommute":45}
         congestion vs people-per-road r = 0.547, vs population r = 0.551, vs SEED r = -0.075
         146 of 198 games with any congestion

after    923 buildings (629 homes), 8899 road tiles, pop 7048
         traffic pass: median 0.59ms, worst 0.65ms
         summary: {"commuters":1263,"congested":364,"stranded":161,"averageCommute":45}
         congestion vs people-per-road r = 0.547, vs population r = 0.551, vs SEED r = -0.075
         146 of 198 games with any congestion
```

**Not a null result — the wrong gate for this change, and worth saying so.** `traffic_gate`
measures `engine/traffic.js`, the commuter pass that fills `tiles.traffic`; T1 touches
`client/world/lanes.js` and `client/life/traffic.js`, both renderer-local (ruling 037). The two
cannot move each other, and "must not change: `engine/traffic.js`" is exactly that promise. What
CAN see the change is the local simulation, so `lanes_dump` measures it now:

```
before   signals 372   400 cars, 291 moving (73%), mean 3.37 m/s of an 11 m/s limit
after    signals 337   400 cars, 304 moving (76%), mean 3.53 m/s
```

Fewer lights is slightly freer flow on the fixture that keeps most of them; on the deputy city,
where 1,126 junctions become 41, the change is the picture rather than the number.

**`budget_gate`'s night row is unchanged** at 289,446 of 320,000 and the street chunks at 269,940
— the review expected it to drop a little, and on the saturated fixture 337 of 372 junctions keep
their heads, so it does not. No fixture hash moved. Suite green twice; all fifteen gates green.

**What failed on the way.**

*The priority rule was backwards on the first try.* "The minor arm is the shorter corridor" reads
as obviously right and hands the right of way to the side road at every T in the city: a junction
splits the road that runs THROUGH it into two corridors, one either side, while the road that
ends there stays whole — so the stem is the longest corridor at the node. Two arms on an axis is
what "runs through" means, and length only breaks a tie between two axes that both do.

## slice-M2 — a gate runner with a time budget (2026-09-08)

`workitems-mainline.md` M2, the first item of the lane after cityviewer.

**What it is.** `node tools/gates.mjs [quick|render|sim|all] [--list]`. Each gate's wall time is
printed and written to `reports/gates-<date>.json`, with the tail of its own output when it
fails — "FAIL" alone sends the reader back to run it by hand, which is what the runner is for.

**Measured, first run, era `476c69c` on SwiftShader:**

```
quick   375 s of an 8-minute budget   12 gates
        budget_gate 102s, ui_smoke 66s, a11y_smoke 45s, reach_smoke 43s, play_smoke 40s,
        lobby_smoke 33s, mvp_acceptance 18s, offline 10s, save 7s, update 5s, client 5s, serve 3s
render    3 s of a 2-minute budget    walkthrough 2.3s, lanes_dump 0.5s, passability 0.2s
sim     595 s of a 15-minute budget  sim_sweep 439s, traffic_gate 80s, disaster_soak 76s
```

M2's own item guessed `quick ≤ 5 min` and `render ≤ 15`; the measurement says **6.25 and 0.05**,
which is the point of measuring. The budgets in the file are those numbers plus room, and a set
that grows past one prints a warning naming the gate that grew.

**`test/gates.test.js` is the part that keeps it honest.** It walks `tools/` and fails if a file
ending in `_smoke.mjs`, `_gate.mjs` or `_soak.mjs` is in no set — a gate nobody runs is worse
than no gate, because it looks like coverage from outside. It checks the other direction too (a
set naming a gate that no longer exists would be skipped silently), that `all` is exactly the
union, that every set has a budget, and that asking for a set that does not exist is refused
rather than reported as "0 gates, all green".

**`README.md`'s gate list is the runner's sets now.** The old list had not named `walkthrough`,
`passability`, `lanes_dump` or `budget_gate`'s flags for the whole of the cityviewer lane, and
`test/gates.test.js` fails if the README stops naming the runner. The slice-workflow skill's step
5 says which set a slice runs.

**Leaked browsers.** Three headless-chromium trees from 2026-09-06 were alive during the V8
review, so some gate's failure path does not close its own. The runner counts them before and
after a set and reports the difference; the count is the finding, and narrowing it to one gate
needs the count to exist first. **The `quick` set leaked none on this run** — which means the
leak is on a FAILURE path, and every gate passed.

**What failed on the way.**

*Importing the runner ran it.* `test/gates.test.js` imports `SETS` and `GATES` to check the sets
are complete, and `tools/gates.mjs` is a script: the import executed the whole `quick` set inside
`node --test`, and the unit suite hung. Everything below the tables is behind
`import.meta.url === \`file://${process.argv[1]}\`` now — the same guard `screenshot.mjs` already
had, which is why it was safe to import and this was not.

## slice-M1 — `main` is `dev_night` (2026-09-08)

`workitems-mainline.md` M1. `main` had had no commit of its own since `491f9bf` on 2026-09-05, so
it fast-forwarded: 55 commits, no squash, no rebase. The per-slice history is the project's
memory and `dev-log.md` cites its SHAs.

```
9339ba4 slice-M2: a gate runner with a time budget
476c69c slice-T1: signals only where two real streets cross
be53905 slice-R4: the lane that read its street backwards
```

**Checked, as the item asks:** `slice-E0` is `04bc793`, and `slice-V8` (`2544c08`), `slice-R4`
and `slice-T1` are all in `main`'s history. 91 commits on the branch, none of them a merge
commit.

**Measured on the merged tree.** `./test.sh` green twice. `node tools/gates.mjs quick`: **380 s**
of an eight-minute budget, twelve gates, no leaked browsers — budget_gate 104 s, ui_smoke 66,
a11y_smoke 46. The `sim` set on the same tree: **595 s** — sim_sweep 439 s, traffic_gate 80 s,
disaster_soak 76 s.

**Not pushed.** The item's last line is "push both", and that publishes 55 commits to a shared
remote; the item is marked "needs Kjell" and this is the half that does. The command is
`git push origin main` from a tree that is already green on it.

## slice-M3 — the release checklist (2026-09-08)

`workitems-mainline.md` M3. A page that says what the game IS at this commit, for a player and
for the next developer — every other document says what it is meant to be.

**`RELEASE.md`** carries the commit (`36aeefb`), era 1, the tier table, the three gate sets with
their measured times (quick 380 s, render 3 s, sim 595 s), a frame at High (289,446 of 320,000 at
night), what is known to be missing, and how to run it. The "missing" section is the honest half:
nothing has been measured on a real device, the simulation is on the render thread, multiplayer
is not started, Norwegian is drafted and not reviewed, and treasuries run away by design.

**`test/docs.test.js` gains five checks**, and the shape of them is the point:

- the page names a commit, and that SHA is a commit that exists in the history;
- how far behind `HEAD` it is is **printed as a note, not failed** — M3 asked for a warning, and
  it is right: a release page is stale the moment the next slice lands, and a test that goes red
  for that gets re-dated rather than read;
- it carries the tier budgets from `data/cityviewer.json`, so the one table a reader is most
  likely to trust cannot drift from the data;
- and its open-question count equals `dev-questions.md`'s — the one number on the page that would
  otherwise rot in silence, because the open list grows every slice.

**`plan-v1.md`'s Progress section** rewritten for the merged state: `main` is the game, Waves 0–4
and cityviewer complete, Wave 5 gated on a playtest by ruling 003, and a table of the four lanes
that follow with where each stands. **`specs/plan.md` §6 and §9** get a pointer each rather than a
rewrite — §6 now says the predicted budgets were replaced by measured ones (40k/140k/320k) and §9
says where the waves stand.

**Measured.** Suite green twice; `gates.mjs quick` **375 s** of 480, twelve gates, no leaked
browsers.

**What failed on the way.** Two of the five checks were written to assert something no reader
would want: the first wanted the page to mention the word "RELEASE" (it *is* RELEASE.md), and the
second wanted an open-question count the page had written out in words — "Ten questions are open"
— which is exactly the form that rots without anything noticing. The page says **10** now, in
digits, because the test is what keeps the number true.

## slice-M4 — the Norwegian table, ready to review (2026-09-08)

`workitems-mainline.md` M4. **Half of it: the half that is mine.** Its "done when" is Kjell
returning the table, so this is the tool, the test and the table — not the pass itself.

**The check that was missing.** Key parity has been enforced since slice 4.2 and it is the wrong
question on its own: `t()` returns its own argument on a miss, so a catalogue can be complete and
still be English. `test/i18n.test.js` now refuses any Norwegian value byte-identical to its
English unless it is on `SAME_IN_BOTH` with a reason. **Ten are**, and every one is real —
*Standard*, *Region*, *Park*, *Storm*, *Auto* (twice), *Retro*, the game's own name, and a string
that is nothing but an interpolation token. Two more checks keep the list honest in the other
direction: an entry for a string since translated, or for a key that is gone, is red.

**And one nothing was watching at all.** `data/names.json`'s shop names are not in the i18n
catalogue — R2 gave them `{en, no}` (A40) and no test has ever looked at them. 2 of 18 are the
same in both (*Deli*, *Pizzeria*, which are the same word in Norwegian); the check fails if a
third of them ever are.

**`tools/i18n_review.mjs`** writes `reports/i18n-review.md`: 414 strings, each with the English,
the Norwegian, and **the slice that added it** — 280 came in the initial commit, 67 in slice 0.1,
21 in N21, and the rest in ones and twos across thirteen slices. A batch from one slice shares a
voice and usually a mistake, so they are worth reading together. `--apply` reads the edited table
back.

**The round trip is the part worth being careful about**, and it was tested by doing it: editing
one cell applies one change and names it; a row with a column missing and a row with an empty
Norwegian are both refused, and **the whole file is refused, not the rows it understood** — a
tool that applies what it could parse and drops the rest leaves a catalogue nobody can reason
about and a reviewer with no way to tell.

**Measured.** Suite green twice. `test/gates.test.js` gains a check that a tool which is not a
gate is not expected to be in a set: `i18n_review.mjs` produces a document for a person, not a
pass or a fail, and the `_smoke`/`_gate`/`_soak` naming is what keeps that distinction from being
a matter of memory.

**Not done.** A21 stays open until Kjell has read the table. That is the item's own definition
and no amount of tooling closes it.

## slice-D1 — the performance card (2026-09-08)

The first item of `workitems-measurement.md`, and the lane's whole premise: every frame time this
project has ever produced came from SwiftShader, and the three tiers, the governor and the
40k/140k/320k budgets were designed for a phone and an RTX 4090 that have never drawn a frame.

**`?perf=1`** boots the real page into a scripted sweep on the saturated 96×96 fixture and ends
with a JSON card and a **Copy** button. Nothing is sent anywhere — there is no endpoint, no fetch
and no consent question to get wrong; the measurement leaves the device only if the person copies
it. `client/debug/perf-sweep.js` is the sweep as pure data, so `test/perf-sweep.test.js` can argue
about the *shape* of the measurement in node: every mode, both styles, four zooms, a low pitch, a
night frame and somebody walking. `tools/perf_card.mjs` drives the same list under Playwright.

**Measured**, `reports/perf/swiftshader.json`, build `9efa0c0e4cc6`, 70 s for the whole tool.
Three runs of it agree to within one 16 ms frame on every row, which is what a fresh session per
step bought:

| step | p50 | p95 | triangles | calls | cars | the ladder |
|---|---|---|---|---|---|---|
| city 20t | 216.6 | 216.8 | 239,274 | 71 | 1,546 | street detail not resolvable |
| city 40t | 233.3 | 250 | 256,068 | 63 | 1,546 | detail not resolvable |
| city 80t | 83.4 | 100 | 68,960 | 57 | 3,071 | silhouette only |
| city 120t | 83.2 | 83.4 | 49,400 | 54 | 3,075 | buildings only |
| city 40t 14° | 233.3 | 250 | 261,800 | 65 | 1,546 | detail not resolvable |
| ortho 96t | 83.2 | 83.4 | 48,680 | 53 | 3,075 | buildings only |
| city 40t night | 350.1 | 366.7 | 268,276 | 67 | 1,546 | detail not resolvable |
| city 40t painted | 216.7 | 249.9 | 256,068 | 63 | 1,546 | detail not resolvable |
| street walk 60 m | 100 | 100.1 | 262,948 | 50 | 6,028 | detail dropped for budget |

**Read it for what it is.** Triangles, draw calls, the ladder's reason and the governor's
sacrifices are counted by the renderer and are true on any machine. The frame times are a
software rasteriser in a container — 3 to 12 fps — and say nothing whatever about a phone. That
is the row's job: to be the honest name for what every previous performance claim here was
actually about.

`ui_smoke` presses Copy and parses the clipboard (`?perfHold=1` shortens every hold, so the gate
checks the card rather than paying for a measurement): **122 checks, 92 s**, up from 66. That is
the whole cost of the slice to the gates — `quick` is **401 s of its 480 s budget**, 12 of 12
green, no leaked browsers. Suite green twice, 1,087 tests.

**What failed on the way — seven things, and five of them were the instrument.**

1. **`saturatedCity` returns `{ state, paved }`**, and the card handed the wrapper to `play()`.
   `startGame` threw on `state.players.some`, `main.js`'s catch drew "Something went wrong"
   *behind* the card, and the card sat on "Measuring — do not touch the screen" for a hundred
   seconds. Both halves fixed: the call, and a card that now writes the failure and the stack onto
   itself. A card that has stopped looks exactly like a card that is still working.
2. **`walker.foot` is the height of the ground under the walker — one number.** Differencing it
   for a distance gave NaN, `NaN < 60` is false, so the street step released the walk keys on its
   first frame and reported a leg of `null`. It is `walker.pose` that has an x and a z.
3. **Two of the four zooms were one measurement printed twice.** On a 96-tile fixture everything
   is already inside the frustum at span 120, so 120 and 240 both read 49,400 triangles and
   83.3 ms. The ladder is now 20 / 40 / 80 / 120.
4. **The saturated city had no cars in it.** The fixture pushes its buildings straight into the
   array with no zoning demand behind them, so the reducer never routes a commute and
   `state.tiles.traffic` stays zero — a sweep of a city with 11,000 residents and no moving
   vehicle. `saturatedCity` gained a `traffic` option seeding the same load of 200 `lanes_dump`
   has used since E4; the span-40 row promptly changed its mind from "detail not resolvable" to
   **"cars dropped for budget"**.
5. **`session.pause()` was called, was called on the right object, and did nothing** — for four
   runs. The stored default style is `painted` and the sweep opens on `plain`, so step 1 rebuilt
   the renderer (a style is a new renderer over the same state, R2) and the *replacement* session
   ran at speed 1. `CITY.pause()` from outside the page failed the same way and for the same
   reason. The tick climbed 402 → 445 across a sweep while the seeded load decayed 531,200 →
   124,832. Every session is now born paused, in one helper, because pausing one of them was
   indistinguishable from pausing all of them.
6. **Then the cars accumulated across the sweep.** The local traffic sim fills a link while it is
   on screen and never empties it again, so the run went 1,546 → 3,071 → 5,454 → 7,455 → 8,927 →
   9,052 → 9,222 — and then fell back to 1,546 the moment a style change happened to rebuild the
   renderer. The night row read **700 ms** and it was not the night: it was six times the cars of
   the day row. Nine views of one city have to start from one place, so every step now gets a
   fresh session and a warm-up that ends when the car count stops moving. Night is 350 ms against
   233 ms of day at the same 1,546 cars, which is a number about the night.
7. **A 60 m leg does not exercise the chunk baker.** A street chunk is 16 tiles — 320 m — and the
   walker never leaves the one it started in. What costs is *arriving*, so the bake is measured in
   the warm-up and reported beside the frame rather than mixed into it: **one chunk, 13 ms**,
   against an 8 ms budget. That number is new and it is over.

The reason five of seven were the instrument is that this slice is nothing but an instrument. The
lesson is the one the V lane kept teaching in a different costume: **verify the instrument, then
verify what it is pointed at** — and a measurement whose steps inherit each other's state is nine
measurements of nine different cities.

**Not done.** Real hardware is D2 and it needs Kjell. Q69–Q71 record what this slice found and
did not fix.

## slice-D4 — the reference compare sheet (2026-09-08)

The gate the measurement lane started from and never built: **how far is the picture from the
target?** `node tools/compare_sheet.mjs` writes `reports/compare-transport-worlds.png` — each of
Kjell's three reference shots beside a City Grid capture aimed at the same kind of thing, at the
reference's own aspect, with the camera and the counts in the caption. Judged by eye on purpose: a
number cannot say "the roofs read as one grey mass at this zoom", which is the only kind of finding
this sheet exists for.

**Matched to the references as they actually are.** The item describes "a road with cars, a
lakeside, a hill with a road up it"; the three files in `debugging/` are a lake with a queue of
cars round it, a town from above with a river through it, and a close low view down a residential
street. Checking what the "before" actually was is a lesson this project has now paid for three
times.

**What the sheet says**, at `e0c977f`, 3 rows, ~9 min:

1. **Ground colour is the largest single difference.** The reference's unbuilt land is a bright
   saturated green; ours is a muted olive-tan, and where it is zoned and unbuilt it is flat grey.
2. **Our town has no edge.** The reference's town sits in a field and reads as a place; the paved
   grid here runs to the map edge, so there is no silhouette to recognise.
3. **Roofs are low-chroma.** Reference roofs are red, orange, cream and slate; ours are tan, olive
   and dark, and at the town zoom they average into one colour.
4. **Streets are wide relative to the buildings.** The reference's carriageway is about a house
   wide with gardens either side; ours is wider and the gardens are thinner.
5. **The water reads well.** The shore, the shallows and the gradient at the waterline are the one
   row where the two halves are close.

**Two defects the sheet found, and neither is a picture.**

**`?life=1` did nothing, in every screenshot this project has ever taken.** `client/life/` takes
its time as a delta from the caller (ruling 037), and `tools/shoot.html`'s frame loop passed
neither `dt` nor `frameMs` — so `life=1` and `life=0` drew exactly the same empty roads, and every
shot in `reports/` has no moving car and nobody on the pavement. The compare sheet came back empty
beside a reference full of vehicles, which is how it surfaced. Fixed: the loop passes `dt = 1/60`
when life is on, and `frameMs = 16` whatever the clock says, so a slow software rasteriser cannot
drive the governor and make the shot a picture of the governor. Nobody else passes `life=1` through
this harness, so nothing re-baselines.

**The saturated fixture is 1,129 copies of one building (Q72).** `saturatedCity` paints roads and
zones, runs 400 ticks, grows nothing — development wants power, water and demand the recipe never
supplies — and a fallback pushes 1,129 `res` definitions straight into the array. Four gates
measure "a mature city" on a monoculture with no shops, no industry and no residents. It is right
for what a frame *costs* and wrong for what the game *looks like*, so the sheet shoots a played
city instead: forty years of the deputy on 64×64, **294 buildings across five kinds, 2,873
residents, a real commuter load**.

And one more, from looking at it (Q73): **three-quarters of a played city's zoned ground is
empty** — 1,424 of 1,934 tiles — and empty zoning painted flat, at a grazing angle, is a grey slab
the size of the town beside it. Two candidate causes worth telling apart before anything is drawn
differently: the deputy over-zones, or empty zoning is too dark. Nothing red will ever find this
one.

**Measured.** `gates.mjs quick` **401 s of 480**, 12 of 12; `render` 3 s of 120.
`test/compare-sheet.test.js` — 9 checks on the camera specs as data, including that
**every reference in `debugging/` is matched by exactly one view**: a reference Kjell adds and
nothing aims at is the reachability failure in a new costume. Suite green twice. The sheet's
working captures are gitignored; the sheet itself is 2,260 × 2,006 and is the artefact.

One false alarm worth writing down: `render` reported **"LEAKED 1 headless browser"** while
`quick` was still running in another shell. The leak detector counts every `chrome-headless-shell`
on the machine, because it has no way to know which set started which — so two gate sets at once
makes the runner accuse itself. Run alone, it reports none.

## slice-D6 — the big map and the steep map (2026-09-08)

Every cityviewer number was taken on a 96×96 `rolling` city. Three open questions said "ask again
on something bigger or steeper", and the recipe those questions are measured through could not
make a steeper map at all — `saturatedCity` hard-coded the terrain style. So: `terrain` on the
fixture, `<size> <terrain>` on `walkthrough`, `passability` and `lanes_dump`, and `?perfMap=big`
/ `?perfMap=steep` on the performance card, which now records the map it ran on and the water
tiles it drew. **No fix is started here.** This item is the measurement.

**Three cards**, `reports/perf/swiftshader{,-steep,-big}.json`, build `9efa0c0e4cc6`.

> **Era note, added the same evening (D5).** The rows below that depend on how full the city was —
> the night frame's triangles, the ladder's reason, the governor column — were measured with a
> warm-up that settled on *seconds*, and D5 found that this reached a different city on a fast
> machine than on a slow one. They were re-measured after the fix and the corrected numbers are in
> the D5 entry. **The rows that do not depend on traffic are unaffected and stand as written**:
> the water tiles and triangles, the corridor counts, the steepest street, the ungradeable
> corridors, `walkthrough`'s cliffs and the model rebuild times. Those are the four findings this
> slice was for.

| | 96 `rolling` | 128 `hilly` | 256 `rolling` |
|---|---|---|---|
| night frame at High | 268,276 tris | 182,444 | 224,466 |
| the ladder, at night | detail not resolvable | cars dropped for budget | trees dropped for budget |
| the governor, at night | idle | idle | **gave up `pixel`** |
| water tiles / triangles | 594 / 1,188 | 610 / 1,220 | 1,778 / 3,556 |
| water as % of the High budget | 0.37% | 0.38% | **1.11%** |
| model rebuild (`lanes_dump`) | 53.3 ms | 68.3 ms | **184.7 ms** |
| …of which the lane graph | 16.3 ms | 43.3 ms | 108.7 ms |
| corridors | 773 | 1,392 | 7,018 |
| steepest street | 18.8% | **59.3%** | 20.7% |
| ungradeable corridors | 8 of 773 (1.0%) | **459 of 1,392 (33%)** | 53 of 7,018 (0.8%) |
| `walkthrough` | ok | **FAILED** | ok |
| `passability` | ok | ok | ok |

**Q66 is answered and closed in practice.** The water surface is one unculled mesh for the whole
map, and on the largest map the lobby offers it is **3,556 triangles — 1.11% of the High budget**.
A terrain chunk alone is 512. It does not become a problem at any size a player can start. One
caveat worth keeping: the fixture is a `river` map, and a `coastal` one is mostly water.

**Q68 has a shape now.** A bigger map makes the night frame *smaller* — 224,466 against 96's
268,276 — because the ladder drops trees before it runs out of budget rather than after. The 256
run is also the first measurement in this project where **the governor did anything at all**: it
gave up `pixel`. On SwiftShader that is the rasteriser talking rather than the renderer, which is
exactly why D2 exists.

**Q64 is answered, and terrain is the only variable that matters.** Ungradeable corridors are
1.0% on 96 `rolling`, 1.3% on 128 `rolling` and 0.8% on 256 `rolling` — size does not move it.
`hilly` moves it by a factor of thirty: **459 of 1,392, and a steepest street of 59.3%.**

**And a new one nobody had ever looked for (Q74): `walkthrough` FAILS on `hilly`.** Eighty places
where the ground rises more than a metre over two metres — steepest 1.15 m — which is a cliff a
walker cannot climb and a vehicle cannot take. Every `rolling` map is clean (steepest 0.40 to
0.48 m). The gate has only ever been run on `rolling`, so nothing had ever seen it. It is Q64 from
the walker's side, it costs nothing today because `hilly` is decorative, and it is precisely what
stops `hilly` from being playable.

**One number for the worker lane.** The model rebuild is **184.7 ms on 256×256**, 108.7 ms of it
the lane graph. Eleven frames. Q60's answer said 53.7 ms was "the number to beat"; on the largest
map a player can start it is three and a half times that, on the render thread.

**What failed on the way.** Only the obvious: `saturatedCity` had no terrain option, so the first
attempt to run `walkthrough` on `hilly` measured `rolling` twice under two names. `test/saturated.test.js`
is new and checks the options rather than the recipe — that `hilly` is actually steeper than
`flat`, that a seeded commuter load lands on road tiles and nowhere else, and that **no traffic is
seeded unless it is asked for**, because every gate written before D1 calls this with no `traffic`
and a fixture that quietly grew one would re-baseline all of them in silence. Nothing had ever
tested this file, which is how it reached D1 with empty roads and D4 with 1,129 copies of one
building.

**Measured.** Suite green twice, 1,105 tests. `gates.mjs quick` **397 s of 480**, 12 of 12, 0
leaked; `render` 3 s of 120 — both on the default `rolling` 96, unchanged, because the default is
unchanged. `specs/engine/03-architecture.md` §3.4a now carries the three rebuild times instead of
one.

## slice-D5 — the governor, on the first real device (2026-09-08)

Kjell pushed `main`, passed the Norwegian table, and ran `?perf=1` on the RTX 4090 (P57). The card
is `reports/perf/desktop-4090.json`, collected at build `cbbd27806158` — the same tree as the
SwiftShader baseline, so the two are directly comparable.

**It took four minutes to find a defect that eight months of software rendering could not.**

The card is a flat **p50 of 16.7 ms on all nine sweep steps**. A locked 60 fps. A machine with
nothing whatever to complain about. And every one of those nine rows reports
`pixel,ink,shadows,supersample` — the **entire** sacrifice ladder, given up, four seconds after the
city loaded, permanently, on an RTX 4090.

The cause is arithmetic and it is one number. `high.frameMs` was **16**, and a display locked to
60 Hz delivers 16.666 ms. `p95() <= targetMs` is then false forever: the patience window fills, a
rung goes, and a second later another, until the ladder runs out. `low` and `medium` had the same
bug one refresh rate up — 33 ms against a 33.33 ms interval at 30 Hz. **Every tier's target was
its refresh interval rather than a threshold above it**, so any machine hitting its target exactly
was judged to be missing it, always.

It is silent by construction. The picture degrades, and the frame time stays perfect — because
there was never anything wrong with the frame time, so the sacrifices changed nothing that could
be noticed. A player on a 4090 has been playing without the ink pass, without shadows and without
the supersample since slice V2, and the instrument built to catch that was the thing doing it.

**Fixed:** 20 ms at High, 40 ms at Low and Medium — 60 fps and 30 fps, each with a fifth of a frame
of room. One interval late (33.3 at High, 66.7 at Low) still costs a pass, which
`test/governor.test.js` now asserts in both directions: a machine locked to its refresh rate gives
up nothing, and a machine at half that gives up something. A third check fails if any tier's target
is ever set to the interval it aims at.

**Why nothing caught it.** The SwiftShader baseline drew **5 to 26 frames in a five-second hold**.
The governor ignores its first 10 samples and its window is 60 frames — so no measurement this
project has ever taken exercised it at all. It is the "verify the instrument" lesson wearing the
one costume it had not yet worn: not an instrument pointed at nothing, but an instrument that never
got enough input to speak. The card now marks a row that drew fewer than 60 frames, and
`tools/perf_card.mjs` says so out loud.

**A second thing the comparison found: the two cards are not of the same city.** The 4090 put
**4,590 cars** on the saturated fixture where SwiftShader managed **1,546**, and the triangle
counts moved with them — 289,086 against 239,274 at the same zoom. The traffic sim fills a road at
one car per link per *frame*, so the warm-up's "hold until the count stops moving" reached a
different equilibrium at 60 fps than at 5. The warm-up settles on **frames** now (60 minimum,
steady for 30) and reports `settleFrames` and `settled: false` when a machine cannot get there
inside 15 s. That makes the *card* honest; it does not make the *sim* frame-rate independent, which
is **Q76**.

**What the card says about everything else:**

| | RTX 4090 | SwiftShader, same build |
|---|---|---|
| p50, every step | **16.7 ms** | 83–350 ms |
| p95, seven of nine steps | 16.8 ms | 83–367 ms |
| p95, `city 80t` and `city 120t` | **33.4 ms** | — |
| worst frame | 33.3 to **74.8 ms** | up to 466 ms |
| street chunk bake, worst | **9 ms** (7 in the street step) | 13 ms |
| cars on the fixture | 4,590 | 1,546 |

- **Q71 is answered.** A street chunk bakes in **9 ms on a 4090** against an 8 ms budget: over by a
  tenth, not by two thirds. That is a rounding error away from correct, and it stays as it is.
- **The High tier has headroom it is not using** (D3). Nothing on this machine comes near 320,000
  triangles or 20 ms, and the LOD ladder still reports "trees dropped for budget" and "cars dropped
  for budget" on a card that never worked hard. Re-tuning wants the phone card as the other end of
  the range, so it waits.
- **The 4090 drops one frame in twenty on two steps** (p95 33.4). Against the new 20 ms target that
  still costs a rung after a second, and a machine dropping one frame in twenty is not a machine in
  trouble — **Q75**, and tuning the percentile on the one machine that has no difficulty is exactly
  how the target came to be 16 ms.

**Also closed today, all of it Kjell's:** `main` is pushed (M1); the Norwegian table came back with
no corrections, so **A21 is closed** after standing open since N12 and M4 is done; and D2 has its
first card. `tools/perf_report.mjs` is new — it folds every card in `reports/perf/` into one
`README.md`, **one table per map**, with a column for what the governor gave up and a column for
whether the row drew enough frames to have tested it. A `big` card and a `base` card are never put
in one table: they answer the same nine questions about two different cities.

**The frame-based settle, checked.** The SwiftShader baseline re-run with it reaches **4,585 cars**
on `city 20t` against the 4090's **4,590** — the same city, from two machines two orders of
magnitude apart in speed. It also now says out loud what it could not reach: six of the nine rows
report `settled: false` after fifteen seconds, and seven report a thin sample. Those notes are the
point. The rows themselves moved as expected once the city was full: `city 20t` went 216.6 → 299.9
ms p50 and its ladder reason from "street detail not resolvable" to "cars dropped for budget",
because it is now drawing three times the traffic.

**Where the number now lives, and what watches it.** `data/cityviewer.json` is still the source
and `client/world/config.js` still mirrors it, but the frame target had been in those two files and
in **no document at all** — which is how it stayed at the refresh interval for the life of the
governor. Ruling 040's tier table gains a *Frame target* column and a second amendment; `RELEASE.md`
gains the same column; and `test/docs.test.js` now fails if either stops matching the data file, or
if any tier's target is ever set to the interval of 30, 60, 120 or 144 Hz. The rule is guarded
where the number lives, not only where the governor reads it.

`test/gates.test.js`'s "a tool that is not a gate" list gains `perf_card`, `perf_report` and
`compare_sheet`: a measurement is not a pass, and a gate set that ran them would take twenty
minutes to tell you nothing.

**Still missing: a phone.** D3 and the rest of D5 both read a Medium card from a device that
struggles, and every tier number in this project is still set against machines that do not.

### slice-D5, continued — the three maps re-measured, and what the 4090 drew that nothing else has

The frame-based warm-up changed what the SwiftShader cards are cards *of*, so `base`, `steep` and
`big` were all re-run. The traffic-independent findings of D6 stand unchanged — water, corridors,
grades, cliffs, rebuild times. What moved is everything downstream of how full the city is:

| night frame at High | 96 `rolling` | 128 `hilly` | 256 `rolling` |
|---|---|---|---|
| triangles, D6 (seconds-settled) | 268,276 | 182,444 | 224,466 |
| triangles, now | **130,936** | 182,444 | 224,466 |
| the ladder | cars dropped for budget | cars dropped for budget | trees dropped for budget |
| cars actually on the map | 3,071 | 2,784 | **28,023** |

**Night now costs exactly what day costs** — 130,936 triangles and the same ladder reason on
every map, and the same on the 4090's card (158,436 for both). Not a surprise once looked at: at
span 40 the ladder has already dropped the street chunks, and the night's lamps and lit windows
live *inside* those chunks. Q68's "93% of the budget in eight baked chunks" is a statement about
the close zoom and the street camera, not about the whole night.

**And the one thing only the real device has ever drawn (Q77).** At `city 20t` — the closest city
zoom — the 4090 draws **eight live street chunks, 258,536 of its 289,086 triangles, 90% of the
High budget**. SwiftShader draws **zero** live chunks in the same view, on any of the three maps,
and reports 140,306 triangles. The chunks are gated on resolvability, `tilePixels` is a function of
canvas height, and the headless viewport is 1280×720 at DPR 1 where Kjell's is 2560×1305 at DPR
1.5. So the most expensive thing this renderer builds has never once appeared in a city-zoom
measurement — the closest any gate came was the street camera, which is a different frame.

That is "a gate that drives one configuration proves one configuration" costing the project its
single largest cost centre, and it is also the strongest argument yet for D3: the one view that a
real machine actually draws in full sits at 90% of a budget that was set by prediction.

**D3 is marked blocked, on purpose.** One card is not a range. Everything the item would do to
High is "raise it" with nothing to say how far, and everything it would do to Medium and Low is
guesswork about a device that has never run the game. Tuning the tiers on the machine with the
headroom is precisely how `high.frameMs` came to be 16 ms.

**Documents brought in step with the number.** The frame target lived in `data/cityviewer.json` and
`client/world/config.js` and in **no document at all**, which is how it stayed at the refresh
interval for the life of the governor. Ruling 040's tier table gains a *Frame target* column and a
second amendment; `specs/engine/08-camera-lod-budget.md` §8.3 gains the same column, the corrected
sacrifice order (`pixel` first, since R1.4) and a note that no tier budget has been measured on a
device that struggles; `RELEASE.md` carries the column too. `test/docs.test.js` fails if either
table stops matching the data file, and a new check fails if any tier's target is ever set to the
interval of 30, 60, 120 or 144 Hz — the rule guarded where the number lives, not only where the
governor reads it.

**Measured.** Suite green twice. `gates.mjs quick` **411 s of 480**, 12 of 12, no leaked browsers
(`ui_smoke` 100 s, up from 92: the perf-card check now waits out a frame-based warm-up). `render`
3 s of 120.

## slice-M5 — the review fixes after the measurement lane (2026-09-10)

Four small things the review of 2026-09-09 found. Each named its own test, which is the only
reason they are worth a slice rather than a note.

**1. A busy crossing was busy at both ends.** `traffic.busyAt(corridor, node)` is what a person at
an unsignalled crossing asks before stepping out, and it walked both block links of the corridor
and dropped the node on the floor — the function ended `void node`. A corridor has a link in each
direction and a crossing at each end, and `link.len - car.s` is the distance to the end *that link
runs to*: so a car arriving at the far junction, one that had already gone through this crossing
and was leaving it, held the person standing on this kerb. On a grid that is every crossing in the
city answering for its twin.

One line — `if (link.to !== node) continue;` — and two tests that discriminate. `test/cars.test.js`
parks every car on a through corridor at the middle of its own link, checks both ends are open,
then brings one car up to one stop line and checks that end is busy **and the other is not**. Put
`void node` back and only the last assertion fails, which is what a test for this defect has to
do. A second test says a car on one arm of a T does not make another arm's corridor busy.
`test/pedestrians.test.js` closes the loop from the crowd's side: given an answer that is busy at
one node, the twin crossing is still asked about and the crowd still crosses it.

Nothing in the cars moved: `lanes_dump` is 400 cars, 304 moving (76%), mean 3.53 m/s — T1's
numbers to the digit, because `busyAt` has exactly one reader and it is the pedestrians.

**2. The reviewer's scratch was in git.** Seven `reports/review3-*.log` gate transcripts and four
`reports/tmp/*.png` probe captures, committed by a `git add -A` at the end of a long session and
pushed to a public repository. Untracked (the files stay on disk), and `.gitignore` gains
`reports/review*.log` and `reports/tmp/`. `test/docs.test.js` gains a check in the same shape as
the one that guards `dev-prompts.md` — **by pattern, not by name**, because the next review round
writes `review4-` and a list of names would let it straight through. The artefacts a slice
*delivers* — the perf cards, the compare sheet, the overlay shots, `i18n-review.md` — are not
scratch and stay.

**3. `RELEASE.md` said one number for a frame and there are two.** "289,446 of 320,000 at night"
is `budget_gate`'s street-zoom row; D5's `city 40t` night is **130,936**, and the page did not say
which view either belonged to. Both are named now, with the reason they differ — at span 40 the
ladder has already dropped the street chunks and the night's lamps live inside them, so night
costs exactly what day costs. The model-rebuild line carries D6's three maps (53.3 / 68.3 /
184.7 ms) instead of one, the bake carries the 4090's 9 ms beside SwiftShader's 13, and the
steepest-street line carries `hilly` beside `rolling`.

**4. `main` is three commits behind, and all three are documents.** Said so on the page rather
than pushed: `main` is the release, `dev_night` carries what has landed since, and nothing between
them changes what the page claims. The docs test's drift note exists for this.

**Measured.** Suite green twice, 1,113 tests. `render` 3 s of 120. `lanes_dump` unchanged.

## slice-D7 — traffic that is a function of the roads (2026-09-10)

Two defects in the item, and **only one of them was there**.

**Q76 was real and is fixed.** The density control spent one car per link per *frame*, so how full
a city is was a function of how many frames had gone by rather than of how long. Kjell's 4090
reached 4,590 cars on the saturated fixture in the same warm-up where SwiftShader reached 1,546,
and the triangle counts moved with them — 289,086 against 239,274 at the same zoom, which is two
machines measuring two different cities.

The fix is a per-link credit in cars, accumulated at `FILL_PER_SECOND` (ten) and spent as it passes
one. The equilibrium was never set by that rate anyway: `targetFor` sets it and `spawn` refuses
without a proper following gap, so the rate only decides how quickly a road fills. Ten is what the
old per-frame rule came to at 10 fps, and `update` clamps its delta to 1/15 s, so this never spends
more than one car in a step — the behaviour at any playable frame rate is the behaviour that was
there before.

**Measured**, `lanes_dump` on the saturated 96×96, uncapped so the roads set the equilibrium rather
than the cap hiding it:

| | 60 fps | 15 fps | apart |
|---|---|---|---|
| settled cars, 140 s simulated | **9,436** | **9,462** | **0.3%** |

The gate fails over 10%. Before the fix the same fixture at 60 and 15 fps was 27% apart and still
climbing after twice the time — 82 cars at 40 s and 116 at 80.

**Q69 was diagnosed wrongly, and this slice closes it as such (A54).** The question said cars are
spawned only on screen and never removed when the link leaves it, so a session carries every car it
has ever looked at. They are not. `update(dt)` takes no bounds at all, and `onScreen` is read by
`pose`, `poseLights` and `count` and by nothing else — the density control has always run over
every block link in the city, camera or no camera.

The evidence that raised it, 1,546 cars in step 1 of a sweep and 9,222 in step 7, was **one session
filling toward its own equilibrium over time**. Those steps shared a session; the fresh-session-per-
step change came later in the same slice. And the number it was climbing toward is the 9,436
`lanes_dump` now reports with no camera in the process at all — the two agree to 2%, which is the
whole story.

So the second bullet was not built, on purpose. It would have made the population a function of the
camera, and ruling 037 makes the traffic local and derived from state precisely so that two clients
showing one city show one city. A camera-dependent population breaks that silently. `test/cars.test.js`
asserts the invariant instead: two sims posed with different bounds hold the same number of cars,
and the bounds still filter what is drawn.

**And one thing the fix does not reach — Q78, new.** `update` clamps its delta to `MAX_STEP`
(1/15 s) so a backgrounded tab does not advance a car four hundred metres in one step. The
consequence nobody had written down is that **a machine below 15 fps runs its whole renderer-local
world in slow motion**: at 3 fps the traffic, the crowd and the walker advance at a fifth of real
time, so five wall-clock seconds of standing still are one second of city. It is why the
SwiftShader card still cannot reach the 4090's car counts in a fifteen-second warm-up even with
this fix. The equilibrium is now the same on every machine; the time to reach it is not.

**Tests.** Four in `test/cars.test.js`, and the shape of them is the finding. Comparing frame rates
means comparing **simulated** seconds, not calls — `update` clamps, so a caller handing it 1/10 s
advances the city by 1/15, and counting calls would compare two runs that had lived different
lengths of time and blame the difference on the frame rate. That is why the test steps at 1/60,
1/30 and 1/15 rather than the 1/10 the work item asked for, and why there is a fourth test showing
a one-second delta does exactly what a clamped one does.

**The card gate, and what it could and could not say.** D7 asked for the SwiftShader card to come
back within 10% of the 4090's on every row. It does not, and the reason is worth more than the gate
was: **the 4090's card was collected before this fix**, so the comparison is across two eras, and
**neither card's warm-up reaches equilibrium** — `lanes_dump` needs about 120 simulated seconds and
a fifteen-second warm-up buys a fraction of that. What the card does show is the part that matters:
wherever SwiftShader got comparable simulated time, the two land on the same number.

| step | 4090 (pre-D7) | SwiftShader (post-D7) | city seconds lived |
|---|---|---|---|
| `city 20t` | 4,590 | **4,590** | 5.7 |
| `city 40t` | 4,578 | **4,585** | 5.5 |
| `city 80t` | 4,578 | **4,583** | 7.9 |
| `street walk 60 m` | 8,920 | **8,927** | 14.8 |
| `city 40t night` | 4,590 | 3,071 | 4.0 |
| `city 120t` | 4,578 | 6,088 | 8.9 |
| `ortho 96t` | 4,590 | 6,077 | 9.2 |

**Four rows agree to within two tenths of a per cent** between a software rasteriser and an RTX
4090. The rows that disagree disagree by how much city each lived through — and that is now printed
rather than inferred: `traffic.simulatedS()` is the traffic's own clamped clock, `stats.trafficS`
carries it onto every card row, and `reports/perf/README.md` tabulates it beside the car counts.
This card's rows live between **4.0 and 14.8 seconds of city**, a spread of nearly four to one
inside one sweep.

At those durations a road is still on the steep part of its curve — about three cars per link of an
eventual six or seven — so one extra spawn round is several hundred cars across 1,546 links, and
two rows a tenth of a second apart can differ by a fifth. **The comparable quantity is the settled
city, and no fifteen-second warm-up reaches it**; that is what `lanes_dump` measures instead, and
why it is the gate that answers.

**What did not move.** `lanes_dump`'s flow row is 400 cars, 302 moving (76%), mean 3.51 m/s —
unchanged from T1. The traffic step is 0.19 ms bare and 0.36 ms with 120 yields.

## slice-D8 — the desktop viewport in `budget_gate` (2026-09-10)

Q77: street chunks bake only where a tile covers `RESOLVE.l3` pixels, `tilePixels` is a function of
the canvas **height**, and every headless gate in this project draws 1280×800 at a device pixel
ratio of 1. So the most expensive thing this renderer builds had never once appeared in a city-zoom
measurement — the closest any gate came was the street camera, which is a different frame — and the
first sight of it was Kjell's card reporting eight live chunks and 258,536 of 289,086 triangles.

**The two sides of the threshold, as one assertion each** (`test/lod.test.js`), on the nearest chunk
rather than the camera's target, because the ground in front of the eye is what bakes first:

| | span 10 | span 20 | bakes? |
|---|---|---|---|
| the gate's canvas, 720 px | 124 px a tile | **62** | no, and never has |
| the 4090's canvas, 1,957 px | 336 px a tile | **168** | yes, by 5% |

`RESOLVE` is exported for this. A test that hard-codes 160 to describe a table in another file is
the stale-model defect this project keeps finding, and the third assertion is the one that makes
the pair mean something: the two numbers are in **exactly** the ratio of their canvases, so nobody
can read the finding as a claim about the camera.

**`budget_gate` gains the rows**, at the card's own canvas height:

| span | live chunks | chunk triangles | frame | draw calls | ladder |
|---|---|---|---|---|---|
| 10 | **8** | 69,444 | 106,059 of 320,000 | 29 | full |
| 20 | **9** | 76,228 | 132,379 of 320,000 | 32 | full |

**Between half and two thirds of the frame is street chunks** in the one view a real machine draws
in full, and no gate could see any of it before today.

**What the intermediate attempt taught, and it is the reason the viewport is what it is.** The
first try used 1706×960 at a ratio of 1.5 — a 1,440 px canvas — and span 20 resolved **zero**
chunks while span 10 resolved nine. The finding lives in the last quarter of the 4090's height. So
the gate matches that height exactly (1,305 CSS at 1.5 = 1,957) and narrows the width to 1,440:
above an aspect of one `tilePixels` depends on the height and nothing else, which the third lod
test asserts, so this reproduces the threshold at a little over half the fill rate.

**Span 20 is a knife edge on purpose** — 168 px against 160. That 5% is the margin by which every
headless gate has been missing the renderer's largest cost centre, so a change that flips it is
exactly what the row is there to notice. The comment says so, in the hope that the next person to
see it go red fixes the cause rather than the tolerance.

**Cost, and the item's own rule about it.** D8 said that if the rows add more than a minute they
go to the `render` set. At a 96-tile map with 400 ticks and 60 settle frames they added **100 s** —
so they were trimmed rather than moved: 64 tiles, 240 ticks, 30 frames, which is enough for a baker
that builds one chunk a frame and a tier that allows nine. `budget_gate` goes 101 s → **150 s**, an
addition of **49 s**, and the rows stay in `quick` where a regression in them goes red in the set
everybody runs.

**One deviation from the item.** It asked for `client_smoke`'s draw-call cap to be checked at the
big viewport; the check lives in `budget_gate` instead, where the big-viewport page already exists
— standing a second one up on a software rasteriser costs another minute to assert the same number.
Both spans are well inside it: 29 and 32 calls of 80.

**One flake, entirely self-inflicted, and worth the note.** A run died with *"Execution context was
destroyed, most likely because of a navigation"* in the cars section, nowhere near the change. The
cause was me: `make_precache.mjs` ran while the gate was running, which rewrote the service
worker's version, and `client/main.js` reloads once on `controllerchange`. **A gate reads the
repository as it runs.** In the slice-workflow skill now.

**Measured.** Suite green twice, 1,120 tests. `gates.mjs quick` **454 s of 480**, 12 of 12, no
leaked browsers — `budget_gate` 149 s, `ui_smoke` 99, `a11y_smoke` 44. `render` is **17 s of 120**,
up from 3: D7's two 140-second settles took `lanes_dump` from 0.5 s to 14. Cheap where it sits, and
worth knowing it is now the slowest thing in that set by an order of magnitude.

**And that is a finding in itself (Q79).** The set is at **95% of its budget**, and the budget was
set in M2 as "the measurement plus room". The room is gone: the measurement lane bought its
coverage with about 75 seconds — D1's perf-card check in `ui_smoke` and D8's rows here — and the
next gate that grows trips the warning. The budget is deliberately **not** raised. M2's rule is
that a gate which grows past its share is a finding rather than a fact of life, and raising the
number to fit is exactly what that rule forbids.

## slice-D9 — the card after the fixes (2026-09-10)

Kjell ran `?perf=1` on the RTX 4090 at build `167b733c86ca` — D8's tree, so the same code both
fixes landed in. It closes two open things and opens one small one.

**D5 is confirmed on real hardware, and the two cards side by side are the proof.**
`reports/perf/README.md` now carries the pre-fix card as its own column, kept deliberately as
`desktop-4090-before-d5.json`, because a fix with no before is a claim:

| what the governor gave up | before D5 | after D5 |
|---|---|---|
| `city 20t`, `40t`, `80t`, `ortho 96t`, `night`, `painted`, `street walk` | pixel, ink, shadows, supersample | **none** |
| `city 40t 14°` | pixel, ink, shadows, supersample | pixel |
| `city 120t` | pixel, ink, shadows, supersample | pixel, ink, shadows, supersample |

**Idle on seven of nine rows**, where before it spent the whole ladder on all nine at a locked
60 fps. And the two rows where it still acts have something to act on: `city 120t` genuinely runs
at **42 fps** on a 4090 (212 frames in a five-second hold) with a p95 of 33.4 ms, and `city 40t 14°`
has a worst frame of 66.7. That is the instrument doing its job rather than eating the picture.

**D7's card gate is met, and the number is 0%.** Both machines carry `simulatedS` now, and the rows
that lived comparable amounts of city agree exactly:

| step | 4090 | its city seconds | SwiftShader | its city seconds | cars apart |
|---|---|---|---|---|---|
| `city 20t` | 4,578 | 6.1 | 4,590 | 5.7 | **0%** |
| `city 40t` | 4,578 | 6.1 | 4,585 | 5.5 | **0%** |
| `city 80t` | 4,578 | 6.1 | 4,583 | 7.9 | **0%** |
| `street walk 60 m` | 8,914 | 16.2 | 8,927 | 14.8 | **0%** |
| `city 120t` | 4,578 | 6.2 | 6,088 | 8.9 | 25% |
| `ortho 96t` | 4,578 | 6.1 | 6,077 | 9.2 | 25% |
| `city 40t night` | 4,578 | 6.1 | 3,071 | 4.0 | 33% |

A software rasteriser and an RTX 4090 reporting the same city to the car. Every row that disagrees
disagrees in the direction its clock predicts — more city seconds, more cars — which is what a
fill by time means and what a fill by frame could never have produced. Note the 4090's own column:
**6.1 seconds and 4,578 cars on every single city row**, which is the property D7 was for.

**The one it opened: the street step walked 18 m of 60.** SwiftShader walks the whole leg; the
4090 covered 18. The card could not say which of three things happened, so the first move was to
rule out the arithmetic — `client/life/walker.js` driven in node over twelve starting points on the
saturated fixture covers **60.0 m at 60 fps and 60.4 m at 10**, running, and 24.0/24.2 walking. The
walker's model is frame-rate independent. So the answer is in the session, and the card now carries
what names it: `walkSpeed` (4 m/s is a run, 1.6 a walk), `walkBlocked` and `walkFrames`.
`tools/perf_card.mjs` prints the reading — against something, or the run key never took, or it
simply ran out of time. **Nothing is guessed here**; the next card says which.

Worth noting that the step's *purpose* was served either way: `bakedChunks: 9` and a worst bake of
8 ms, which is what the leg is there to exercise.

**And a guard for a class of defect this file has now caused three times.** `tools/` is scripts
nothing imports, so a syntax error in one is invisible to the suite until somebody runs it — at the
end of a slice, as the last step before a commit. `tools/perf_report.mjs` builds a Markdown page in
a template literal and three separate edits quoted an `identifier` in the prose and closed the
template early. `test/tools.test.js` runs `node --check` over the directory: half a second, and the
fourth one goes red in the suite instead.

**Q75 has its answer's first half.** The governor is no longer firing at a machine that is fine.
What is left is narrower and still wants a phone: is spending four rungs in four seconds right for
a *hitch* — p50 perfect, one frame in twenty doubled — where the sacrifices do not touch the cause?
The cheapest untried lever is requiring the p95 to stay over for two patience windows before the
second rung.

**Measured.** Suite green twice, 1,124 tests. `gates.mjs quick` **459 s of 480**, 12 of 12, no
leaked browsers; `render` 17 s of 120. The set has crept another 5 s — **Q79 is 96% now**, and the
creep is `budget_gate` at 152 s rather than anything this slice added.

## slice-F1 — photo mode (2026-09-10)

The film lane's first item, and the fourth camera mode ruling 034 has to answer for. A free
camera: the eye goes where the player puts it, looks where they point it, and obeys neither the
orbit nor the ground. `P` or the button; WASD flies, Shift is faster, drag looks, Escape leaves;
one slim bar with **Save PNG** on it and a HUD that gets out of the way of the picture.

**The arithmetic is pure and the mode is taught to everything that shares it.** `client/world/photo.js`
is eleven node assertions of the things a free camera gets wrong: forward follows the look
*including pitch* (there is no other way up or down), strafe stays horizontal so sidestepping at
the ground does not fly into it, a diagonal is not faster than a straight line, and the speed
follows the zoom — **six seconds to cross whatever you can see**, so the control means the same
thing from the air and from the pavement. Distance is a rate, asserted a hundred hundredth-steps
against one whole one, which is D7's lesson applied before it could be made again.

Then the part that is the actual work: `eyeOf` (deep-equal to the street branch, so the two
free-look modes cannot drift), `tilePixels`, `visibleBounds`, the near and far planes, and
`fogFor` — which asks the photo camera **where it is** rather than what it is called. Below a tile
of eye height it takes the street's fixed reach in metres; above it, the city's multiple of the
span. Both asserted by deep-equality against the modes they should match, because "similar" is not
a test.

**Saving a picture** draws the scene once more into a render target at 2× on High and reads it
back, rather than turning `preserveDrawingBuffer` on and paying for every frame to keep one. The
rows come back bottom-up, so they are flipped a row at a time rather than by drawing the image
transformed, which would resample it. The renderer hands back a blob and `game.js` makes the
anchor: a renderer that reaches for `document` is a renderer no test can drive.

**Three defects, and each was found by something refusing to accept the change.**

**1. The estimate and the renderer stopped agreeing about modes.** Teaching `lod.js` to plan per
chunk in every perspective mode was one word wider than the truth: `instances.js` does it only in
`city`. In street mode the estimate then priced distant chunks cheaply, the ladder stopped stepping
down, and **the street frame came back empty** — `ui_smoke` failing three files from the change,
which is how the architect's review found it before I did. Both now read one exported
`usesChunkPlans`, with a test that fails if `instances.js` grows its own list again.

**2. The way out hid itself.** The first design hid the whole top bar and put the exit inside the
bar photo mode reveals. `reach_smoke` failed twice: no known opener for a hidden container, and
then a click timeout on an opener that had **made itself invisible**, so it could never be the
toggle that closed it. I briefly taught the gate a "modal openers have closers" concept and then
deleted it, because street mode had settled this three slices ago and its own comment says why —
*the one control left is the one that gets you out*. The top bar now empties out but the photo
button stays, and the bar is a single Save PNG (ruling 042 §5: the chrome does not grow).
`test/input.test.js` asserts the CSS keeps that button visible. **Teaching a gate to accept a
design it correctly refused is the wrong repair.**

**3. A gate step that moved shared state and did not put it back.** The new `play_smoke` rows fly
the camera — and left it **69 tiles out over open ground**, so the wheel-into-street check below
could find no corridor and failed for a reason that had nothing to do with the wheel. It also made
the "from street" rows enter from `city` instead. The section snapshots the view and restores it
now. `measurement-steps-must-not-inherit`, in a gate rather than in a sweep.

**4. And one the budget row found before the mode ever shipped.** The near and far planes were
chosen in `applyZoom`, plus a crossing check inside `flyPhoto` — so they were right if the eye was
*flown* to a height and stale if it was set any other way. `budget_gate` put the camera down at
street level directly and got the **city's** near plane, half a tile, which clips the pavement the
camera is standing on. Nothing in the game does that today; F2's shot list sets camera positions
from data and K4's "go there" jumps the view, and both would have inherited it. The planes are
chosen in `applyPose` now — every path goes through it — and `test/input.test.js` asserts both
halves: that posing chooses them, and that flying does **not** do it by hand, so the next path
cannot forget.

**Measured.** Suite green twice, 1,143 tests. `ui_smoke` **130 checks** (up from 122);
`play_smoke` **24 photo rows** across desktop, desktop-perspective, phone and phone-perspective,
W flying about 1.9 tiles in 0.4 s on every one; `reach_smoke` green; `budget_gate` green with the
photo row at **292,968 triangles of 320,000**, 49 draw calls, near 0.02 far 100.

## slice-K1 — the camera cluster on screen (2026-09-10)

Ruling 042, written from Kjell's P59: *"navigation around the world needs to be easier via on
screen keys and mouse left-and-right mouse button."* Every camera movement existed and a player
found out about most of them from the help card or not at all — right-drag orbits, middle-drag
pans, Q and E snap, arrows nudge, F stands in the street. The camera was folklore. This puts it on
the screen, in one place, in every mode.

**`client/ui/camera-model.js` is the table both halves read** — the buttons as pure data: i18n key,
keyboard equivalent, intent, whether it repeats and at what rate, the modes it appears in, and the
label and hint it carries per mode (the pad **pans** in the city, **walks** in the street, **flies**
in photo). `camera-cluster.js` builds the DOM from it, the controller binds the same keys, and
`help-model.js` derives the card from it instead of a hand-written list. One table, three readers.

**Held is a rate.** `holdCamera` / `stepCamera(dt)` live in the controller and the cluster never
touches the view, so ruling 042 §1's *"a button that does something a key cannot, or the reverse,
is a defect"* is true by construction rather than by vigilance. The cluster deliberately has no
timer: a second clock there would let the frame rate decide how far a press moved you, which is the
defect D7 spent a slice removing from the traffic (ruling 042 §3).

Newly bound because the cluster promises them: `PageUp`/`PageDown` tilt — and look, in street and
photo — and **`Home` fits the whole city**, which is the commonest way a player gets un-lost and
until now had no answer but zooming out by hand until something looked familiar.

**It found a defect F1 had shipped an hour earlier.** Photo mode's key was `P`, which is the **pipe
tool's** shortcut. The pipe silently stopped being selectable by keyboard and the whole suite
stayed green, because `test/keyboard.test.js` compares `TOOLS` only against itself and has never
known the controller binds keys of its own. Photo mode is `C` now, and `collisions()` is
scope-aware so it is honest rather than merely strict: `W` is the wire tool in the city and forward
in the street, which is two scopes and no collision, while a global camera key taking `p` is a real
one. **That check is the durable part** — it would have caught F1 the moment it was written.

**And three things only the screenshots could see**, which is why the item asks for three:

1. **Two buttons rendered as empty boxes.** `＋` (fullwidth plus) and `🚶` (an emoji) are tofu in the
   default UI font. `ui_smoke` asserted "zoom changes the span" and passed — the assertion proved
   the button *worked* while the picture showed it was unreadable. Every glyph is now inside the
   range a default UI font is certain to have.
2. **The mode buttons were duplicated.** The item says they *move* from the top bar; I had added
   them and left the originals, so Street and Photo existed twice and the phone's top bar wrapped
   to three rows to hold them. They live only on the cluster now and carry their own shortcut as
   the glyph — `F` and `C` — which is the one place this cluster can teach a key. The phone's top
   bar is two rows.
3. **The hint did not follow the label**: a button reading "Leave photo mode" was explained by the
   hint for entering it. `hintPerMode` sits beside `labelPerMode`, and the reachability test is
   what caught it — the two `.leave.hint` keys became strings nothing could show.

**Two more the gates found before a player could.** `reach_smoke` reported the cluster's first
placement sitting on top of **fireStation, policeStation, hospital and park** — bottom-right, where
the build menu spans the full width above the bottom bar. It is on the right edge, vertically
centred, which is the only edge not already spoken for. And it called `camera-open` a control that
could not be brought on screen, which is exactly what it was: the phone's way in, `display: none`
on a desktop. **A button that is styled away is still a button to anything that walks the
interface**, so it now *exists* only where it is used — `matchMedia` adds and removes it — and "can
a player reach this?" has the same answer as "is this here?".

**The omissions sweep, run after the slice and not before it.** Four things, and one was a
regression this slice caused: deriving the help card's camera rows from `CAMERA_BUTTONS` **dropped
the pause row**, because `Space` is not a camera movement and so has no entry in a camera table.
`test/reachability.test.js` caught it as a catalogue string nothing could show — ruling 027's test
doing exactly its job. Space lives with the actions now.

The other three were dead weight this slice created and nobody would have noticed:
`LEGACY_CAMERA_KEYS`, thirteen lines of table left behind when the card started deriving; three CSS
rules targeting `.hud-street` and `.hud-photo`, elements that no longer exist; and two branches in
`cameraAction` for street and photo, which the cluster routes through the HUD instead — a handler
nothing can reach, which is ruling 026's defect exactly. Four orphaned `help.*` strings went with
them, because the card now shows the button's own words: one table means the card and the button
cannot say different things about one key.

*And a note on the sweep itself:* the first pass reported `POINTER` as unused because it excluded
same-file references, and it is used ten lines below its own definition. A search that cannot see
local use cries wolf, and a sweep nobody trusts is worse than no sweep.

**Q79 came due in this slice and was answered by rearranging, not re-budgeting (A64).** `quick`
reached **477 s of 480** — three seconds of headroom, and the next added check would trip it. M2's
rule is that a gate which grows past its share is a finding rather than a fact of life, so
`budget_gate` moved to `render`, where it belongs on its merits: it is a renderer *measurement* —
three tiers, two projections, four spans, a second viewport — and not a smoke test.

| | before | after |
|---|---|---|
| `quick` | 477 s of 480 (99%) | **326 s of 480** |
| `render` | 17 s of 120 | **166 s of a restated 300** |

`render`'s budget is restated from its new contents rather than left at a number set when the set
took three seconds. A slice that cannot touch the renderer never needed `budget_gate`; a renderer
slice runs both sets, which the slice-workflow skill now says.

**Measured.** Suite green twice. `ui_smoke` **137 checks** with seven new ones that press each
button and read the view afterwards — target, yaw, pitch, span, whichever the button promises —
plus one that holds the pad, slides the pointer off and lifts elsewhere, because a camera that
keeps panning after the hand has gone is the worst bug this control can have. `reach_smoke` ok.
`a11y_smoke` ok **with no new gate code**: the cluster is a `role="toolbar"` on the shared
`makeRoving`, so one tab stop, arrow keys, Home and End, and the remembered tab stop all applied
for free — which is ruling 028's whole point, since a hand-rolled toolbar role once promised a
keyboard pattern that did nothing for nine slices. `play_smoke`: the phone's chrome is **36% of
390×844 against the playtest's 41% ceiling**, the cluster contributing `44×44` because it collapses
to one button (ruling 042 §5).

## slice-K3 (part one) — the two mouse buttons (2026-09-11)

Ruling 042 §2, and the thing Kjell asked for by name in P59. A mouse-only player could not move in
the street at all — the mouse looked and the keyboard walked — and in the city the only pan with a
tool in hand was the middle button, which a trackpad may not have.

**`client/input/buttons.js` is a pure table**, `buttonsToIntent(mode, buttons, { hasTool, hand })`,
and the tests plant every combination: three buttons is eight states, times four modes, times a
tool in hand or not. That grid is more than anybody checks by clicking, and the combination nobody
tried is reliably the one that does something odd. Two of the thirteen assertions are decisions
rather than transcriptions — **no city combination ever builds by accident** (the tool fires on the
left button alone with no hand, so a stray second button mid-drag cannot paint a district), and
**left+right is a run FORWARD** (on the forward axis the two cancel, so `run` carries the meaning;
a caller reading `forward` alone would get a standstill).

**The finding worth the slice: a second mouse button pressed while one is already down arrives as a
`pointermove`, not a `pointerdown`.** That is the Pointer Events spec for a chorded press. The
dolly branch was in `onPointerDown`, which the browser never calls for the second button, so the
code was correct-looking and could not work — span 40 → 40 with no error anywhere. Instrumenting
the real page gave it in one run:

    pointerdown  button 0  buttons 1     ← left
    pointermove  button 2  buttons 3     ← the RIGHT press, as a move
    pointermove  button -1 buttons 3     ← the drag
    pointermove  button 2  buttons 1     ← the right RELEASE, also a move
    pointerup    button 0  buttons 0

Both ends of that mattered. The dolly now adopts the drag on that move and takes it as the
baseline, or its first frame jumps by however far the pointer had already come. And the chord
*breaking* is a move too: releasing the right button while the left is down left `drag.button` at
2, so the next move would have orbited. It ends the gesture instead. It also explains why the
street walk worked by accident — the walk intent is recomputed on every move, so the second button
became a run without needing a `pointerdown`. Right for a reason I did not know at the time.

**The item asked me to assert something that was not true.** "Wheel keeps the ground point under
the cursor fixed (it does today under perspective — assert it)." It did not: `zoomBy` changes the
span and `applyPose` re-orbits an unchanged target, so the point under the cursor drifts toward the
middle and only a cursor at the centre stays put. Checked rather than asserted — and had I written
the test as instructed and run it at the centre of the canvas, it would have passed and protected
nothing. So the anchoring is built, reusing the drag-pan's own `groundAtPixel` so the two cannot
disagree about where the ground is, and the dolly is anchored the same way so the two gestures
agree. `play_smoke` asks **off-centre**, at a quarter-width across, because at the centre every
implementation passes: **0.08 tiles of drift** on desktop, 0.15 under perspective.

**The hand is `H`, not the `Space` the item asked for.** Space toggles the game speed, is on the
help card and is the most-used key in the game; taking it to disambiguate a rarely-used pan would
degrade the common control to serve the rare one. K1's `collisions()` made the clash visible before
the binding was written rather than after — the first time this session a guard has caught
something in advance. Held rather than toggled, because it is a modifier on the drag about to
happen and a mode you can forget you are in is a mode that eats your next click; released on keyup
and on blur, since a hand left down is a build tool that has stopped building.

**And a test that pinned syntax rather than behaviour.** `test/keyboard.test.js` matched the literal
`event.button === 1 || event.button === 2` in the controller source and went red the moment the
buttons moved into a table — while every button still did exactly what it had before. It asserts
through `buttonsToIntent` now: right orbits, middle pans.

**Measured.** Suite green twice. `play_smoke`: the dolly moves the span 40 → 24.3 with **0.000000
rad** of unwanted turn (compared as an angle — `yawBy` wraps into [0, 2π), so a camera that did not
move at all reads as −1.5708 before and 4.7124 after, and a check on the raw numbers calls that a
defect); the wheel holds the ground to 0.08 and 0.15 tiles; the hand pans with a tool selected and
**61 → 61 road tiles**, so nothing was built while it was down.

**Not done in this part**, and named rather than left implied: Pointer Lock with the drag-look
fallback and the first-run overlay (A58), edge scrolling with the touch border-pull (A59), and the
cluster's hand button. The table, the buttons, the dolly, the anchoring and the hand key are in.

## slice-K3 (part two) — free look, the card and the edge (2026-09-11)

The rest of ruling 042 §2 and the two answers Kjell gave with it: **A58**, looking without a held
button plus a first-run overlay, and **A59**, edge scrolling for a mouse with a border pull for a
finger. The hand button the cluster had been missing came with them.

**Looking needs nothing held, where the browser allows it.** `looksNow(mode, buttons, { locked })`
in `client/input/buttons.js` is the whole decision, and it is pure: locked, any pointer movement
turns the view; unlocked, it is the drag-look Q43 chose. The controller asks for Pointer Lock
inside the gesture that entered the mode — the only moment it can be asked for — and again on a
click, so a player who pressed Escape gets it back the way every first-person page works. One
expression reads the delta both ways, `movementX` when locked and the difference from the last
event when not, because a locked pointer has no `offsetX` at all and a drag path reading it would
have turned by exactly zero, forever, in silence.

**A first-run card, because a scheme with no buttons has nothing to discover.**
`client/ui/controls-card.js` derives its rows from `CAMERA_BUTTONS` plus the four gestures the
table cannot carry, has exactly one button — the "don't show this again" Kjell asked for by name —
and a settings row to bring it back. Making that row work took a second edit: `hudOptions` is
reused on every HUD rebuild, so a captured `showControlsCard` would have shown the card again after
a language change and never again after a dismissal. It is a getter now, and turning the row back
on rebuilds the HUD at once rather than at the next boot, which is the ruling 026 failure the
quality tier already avoids.

**Edge scrolling, ramped rather than binary.** `client/input/edge.js`: a band that is 4% of the
shorter canvas axis, capped between 12 and 64 px so it feels the same on a laptop and a 4K panel;
a pointer one pixel inside it barely moves and one against the frame moves at `PAN_SECONDS`, the
cluster's own rate; zero outside the canvas, because a browser reporting a stale position while the
player is in another window must not pan the city for a minute. Touch gets `isBorderPull()`
instead — it is the START of the drag that decides, once, so it cannot steal a one-finger pan or a
drag-paint that happens to begin near the frame. That half was nearly shipped as a module nobody
called: `isBorderPull` was imported, `borderPull` was set to `false` in two places and set to true
in none. The omissions sweep on the slice caught it. It is wired now, in `handle()`, where a paint
intent from a border-started touch drag becomes a pan — which is the same gap the hand fills for a
mouse, and the reason Kjell asked for a pull rather than an edge band a finger cannot rest against.

### Five findings, and one of them was not about this slice

**`?lock=0` did nothing, and the reason was much larger than the flag.** `game.js` read the quality
tier, the projection, the hour and `life` off `options` — which is the WORLD GENERATION record,
seed and size and seats, and has never carried a preference in its life. Every one of them fell
back to a default. A player whose settings said Low and orthographic booted High and perspective,
and only opening the settings panel put it right, because that path calls `setQuality` and
`setProjection` directly. Found by trying to add a fifth flag beside them. Now `given.*`, and
`play_smoke` stores a preference, reloads, and asserts the boot honoured it: **tier "low",
projection "ortho"**.

**A test was pinning the broken line.** `test/render.test.js` asserted the source matched
`life: stillness ? false : options.life` — the exact text of the defect — so the suite had been
green over it since R2. This is the second time in two days that a test written as a transcription
of a line has protected what the line got wrong. It now names `given` and checks the other three
fields with it.

**`hideGhost()` was called where nothing defines it.** Two bare calls in `controller.js`, in the
hand's pointer path and in `setHand`, where the name is `renderer.hideGhost`. A `ReferenceError`
every time the hand went down — the ghost stayed on screen and the cluster's button never learned
the hand was on. `node --check` is syntax-only and `controller.js` cannot be imported by node, so
the suite could not see it; the browser gate's `pageerror` hook is what said it out loud. Third
time this blind spot has cost something (`loadSettings` in R2, `viewport` in `play_smoke`).

**Playwright cannot drive a page that holds the pointer.** `locator.boundingBox()` resolves the
element, reports it visible, and never returns; with the lock actually granted the gate hung twice
for fifteen minutes in a section nowhere near the change. So **every browser gate boots with
`?lock=0`** — `reach_smoke` found this the hard way, hanging on a click on the photo button after
photo mode had taken the pointer — and the locked path is a pass of its own, with nothing else in
it — which is also why the
fallback needed a lever at all: a click asks for the lock back, so on a browser that grants it the
drag path is unreachable from outside. `?lock=0` is the same shape as `?life=0`.

And the locked pass is the one place in this gate that **dispatches** an event rather than driving
one. A locked pointer reports its motion only in `movementX`, and Playwright's mouse API cannot set
it: `page.mouse.move` in a locked page arrives with movement 0 and turns nothing, which is exactly
what the first run of the check reported — a green-looking control that had never moved. The
dispatched `pointermove` still goes through the page's own listener, the real controller and the
real walker; only the two numbers on it are the gate's. Worth naming, because a gate that fakes an
event is normally the failure this project measures against.

**The card covered the map.** `reach_smoke`: four build controls under it and 195 of 403 sampled
points taking no click. It should be prominent — it is the discovery surface for a scheme with no
buttons — but it must not persist, so the ten gates that boot a city dismiss it immediately after
`CITY` appears. And the hand button shipped in part one as `•`, because `buttonsFor()` gave the
cluster a button the glyph map had no entry for: on screen, reachable, labelled, and silent.
`test/controls-card.test.js` walks the map against `CAMERA_BUTTONS` now.

**Measured.** Suite green twice, 1,193 tests. `play_smoke` green: **locked, the mouse turns the
street camera 1.200 rad with nothing held** (yaw 4.712 → 3.512) after the pass proved it was
standing in a street with 48 tiles paved; drag-look turns it **0.900 rad** (yaw −1.571 → 3.812)
with the lock refused, on both desktop rows; a finger pulling from the left border pans **3.98
tiles** and builds **nothing** (13 road tiles before and after) with the road tool in hand; the
pointer resting at the left edge pans **3.12 tiles in 0.5 s**, and **0.000 tiles** with the
settings row off — no reload, since the controller re-reads the preference every frame; the boot
honours a stored **low** tier and **ortho** projection. `gates.mjs quick` green, 11 of 11, **349 s
of a 480 s budget** (ui_smoke 113 s, play_smoke 64 s, reach_smoke 45 s).

**Next:** K2 — held keys move at a rate — then K4 and K5.

## slice-K2 — held keys move, and move at a rate (2026-09-11)

Ruling 042 §3, from the keyboard's side. The cluster's buttons had been a rate since K1; an arrow
key was still one nudge per `keydown`, which means the camera moved in whatever steps the operating
system's key repeat happened to produce — a stutter on a slow repeat, a bolt on a fast one, and a
different distance on every machine.

**`client/input/held.js` is a pure table and four rate functions.** The keyboard now reaches the
same intents the cluster holds, through the same `holdCamera` / `stepCamera` path, so a key and a
button cannot mean different things or move at different speeds — the construction ruling 042 §1
asks for rather than the vigilance it would otherwise need. `Shift` doubles the rate;
`PageUp`/`PageDown` tilt in the street and in photo mode as well, which they had never done from
the keyboard because the mode branches returned before reaching them; the button's own `modes` list
is what decides where each key applies, so a zoom key is still nothing in the street for the same
reason a wheel is.

**Q and E keep the snap, and gained the free turn.** A tap snaps one step, as ruling 006 has always
promised. Held past `FREE_TURN_SECONDS`, the same key turns freely and releasing lands on the
nearest of the four — so a player who wants to look behind a building does not have to know they
asked for a different control. The threshold is counted in accumulated `dt`, not from a clock: the
controller still reads no time of its own.

### Three findings

**A rate applied to a tap is zero.** The gap between `keydown` and `keyup` is shorter than a frame,
so the first version of this made a single arrow press do nothing at all — a dead key, not a
precise one. `TAP_SECONDS` (0.12 s of holding, applied on the press) is the floor, and the hold
continues from there. `a11y_smoke` presses the arrows exactly once and would have caught it; it is
better that the design did.

**Two more tests were transcriptions of the lines they guarded.**
`test/keyboard.test.js` matched `event.key === "q".*rotate(renderer.view, -1)` and
`test/help.test.js` matched the source text of seven more bindings. Both went red the moment the
keys moved into a table while every key still did exactly what it had before — the same shape as
K3's `options.life`, and the third time in two days. They assert the route now: that the release
asks `turnMode` which kind of press it was, that a free turn lands through `nearestYawStep`, that a
tap goes through the snapping `rotate`, and that the held table answers for every key the card
claims.

**`Shift` had no screen.** It modifies whatever is already held, so it cannot have a button on the
cluster — and a control with no button still needs somewhere to be read (ruling 027). It is on the
help card beside `Space`, which is there for exactly the same reason.

**Measured.** Suite green twice, 1,201 tests. `test/input.test.js` integrates the pan rate at
**1/60, 1/15 and 1/144** and gets the same distance within 1%. `play_smoke`, both desktop rows: a
held arrow pans **4.54 tiles in 0.5 s** against a wanted 3.50 (the tap floor and the frames the
press falls in account for the difference), **drifts 0.000 tiles** after the release, and Shift
takes the same half second to **8.98 tiles**; a tap on Q snaps one step; a held E sits **0.244 of a
quarter turn off** a snapped angle mid-hold and lands **exactly** on one when released.

**Next:** K4 — where am I, and go there.

## slice-K4 — where am I, and go there (2026-09-11)

The two questions a player asks when they are lost: show me the city, and put me back.

**Home frames what has been BUILT.** It fitted the whole map before this slice, which on a 128×128
with a town in one corner is a green rectangle with a smudge in it — a way of losing the city
rather than finding it. `client/world/fit.js` is pure and in the world layer, so the cases that
matter are planted in `test/fit.test.js` rather than discovered by zooming out in a browser and
squinting: a corner town, an empty map, one tile, a long thin city. Roads and buildings count and
**zoning does not** — a painted district with nothing on it is an intention, and a camera that
frames intentions drifts away from the city every time somebody paints ahead.

**A second press gives the view back.** "Show me everything" and "put me back" are the same
question asked twice, and a player who pressed Home to get their bearings should not have to find
their district again by hand. The item asked for a three-second window; there is no timer, because
a clock in the controller is a clock the tests cannot hold still — `sameView` asks "is the camera
still where Home put it", which answers the same question without one.

**A compass in the pad's empty centre.** It is a PICTURE (`role="img"`, no button, no pointer
events), which is ruling 028's minimap precedent: a thing that only reports is not a control, and
pressing it would be a second Home. The needle reads the FREE yaw rather than the snapped step, so
it follows a mouse orbit — the amendment to ruling 006 is that the camera may sit between the four
angles, and a compass that cannot show that lies for three quarters of every turn.

**And a double-click walks, in the street.** The phone's tap-to-walk (A34), given to the mouse:
down there a click on the ground already means "that place", and the camera is the walker's head.

### Four findings

**Home did nothing at all in the street.** The street branch owns the keyboard from the top of
`onKey` down, and the Home handler sat below it — so the one place a player most needs a way out
was the one place the key was dead. Handled before the mode branches now, beside the held camera
keys. Nothing had ever pressed it down there.

**`focusOn` takes the target as given.** A half-tile adjustment that read correctly ("focusOn takes
a tile and centres on the middle of it") put the return press exactly 0.5 outside `sameView`'s 0.5
tolerance, so the second Home framed the city again instead of going back — a borderline failure
that a slightly different city would have hidden. The gate found it; reading the line did not.

**The compass grew the chrome, and `reach_smoke` priced it.** A row of its own took "most of the
map takes a click" to **341 of 403**, under the gate's 85% bar, for a picture that had somewhere
free to sit. In the pad's centre cell: **351 of 403**, better than the 345 before the compass
existed. Ruling 042 §5 — the chrome does not grow — has a number behind it now.

**And a gate block that flew the camera did not put it back.** The Home checks zoom onto the city
and turn it a quarter; the orbit checks after them aim at a tile by projecting it, and that pixel
was off the canvas, so the drag landed on nothing and three unrelated checks went red. Restoring
the span through `zoomBy` rather than by assigning `view.span` matters too: the orthographic
frustum comes from `applyZoom`, so a span set by hand leaves the projection describing the old one
and every pixel the gate projects afterwards is wrong by the ratio between them. Second time in
two slices that a camera-moving block has cost a downstream check.

**Measured.** Suite green twice, 1,215 tests. `play_smoke` on both desktop rows: Home frames a
13×1 city at **span 14.9** centred on it, a second press returns to **(12, 12) span 18** exactly
where it started, a double-click centres without touching the zoom (**span 18.0 → 18.0**), and the
compass reads E and follows the view to S when the yaw steps. In the street, on all four rows: a
double-click walks **1.13 m** towards the point, and Home comes back up **in the projection the
player came from** — "ortho" from ortho, "city" from perspective. `gates.mjs quick` green, 11 of
11, **355 s of a 480 s budget**.

**Next:** K5, the phone, and the last item in the navigation lane.

## slice-K5 — the phone (2026-09-11)

The last item in the navigation lane, and the one ruling 042 §5 exists for: everything K1 to K4
built, on a 390×844 screen, without the chrome growing.

**The one button a phone shows is the compass.** A ring with nothing in it says "there is a thing
here"; a needle and a letter say which way you are facing and that the camera lives behind them.
The closed cluster is 44×44 and reads N, E, S or W, turning with the view — K4's compass doing a
second job for nothing.

**And it puts itself away.** A tap anywhere else closes it, which is what every sheet on a phone
does, and five idle seconds close it too. Both only exist where the opener does: on a desktop the
cluster is always open, and a timer that closed it would be a control disappearing from under the
pointer. Any press or key inside the cluster starts the five seconds again — a player halfway
through lining up a shot is not idle.

**Driven through real touch events.** The gate block is in `ui_smoke` and holds the pad and the
rotate button with `Input.dispatchTouchEvent` through CDP, because a constructed `PointerEvent`
carries a pointer id the browser has no record of and the controller's own `setPointerCapture`
throws on it (K3 learnt that the hard way). The pad pans **2.77 tiles** under a finger and rotate
turns the city **0.44 rad**.

### Three findings

**Open, the cluster took the chrome to 50%.** Side by side the pad and two columns of buttons were
232×278 of a 390×844 screen — a fifth of the phone for one control, on top of a top bar and a
bottom panel that already take 30%. Stacked, with the pad above and the rest in rows of three at
the same 44 px targets, it is 136×374: **46% open, 30% closed**, against the playtest's 41%
ceiling.

**The ceiling is the resting state.** An open cluster is a transient the player asked for and which
puts itself away after five seconds; holding it to 41% would mean either buttons under the
accessibility floor or fewer movements than ruling 042 §1 requires. The gate holds the CLOSED
number to 41% and reports the open one, and the two checks either side of it prove the map comes
back.

**Chrome share was being summed, not unioned.** Four rectangles added together double-count
wherever two overlap, so the measurement would have priced an overlapping layout wrongly — and the
first thing anyone tries when a panel is too big is to overlap it with another. Sampled on a 10 px
grid now, in both gates. Nothing overlaps today, so the number did not move; the measurement is
just no longer wrong for the next layout.

**Measured.** Suite green twice, 1,215 tests. `ui_smoke`: the closed cluster is **1,936 px²** of a
**329,160 px²** screen and reads its compass letter; opening it shows the pad and the buttons;
the pad pans and rotate turns under a finger; the chrome is **46% open**; a tap outside closes it;
and it closes itself **after 5.4 s** with nothing touching it. `play_smoke`: **30% closed** on both
phone rows, against the 41% ceiling. `gates.mjs quick` green, 11 of 11, **368 s of a 480 s
budget** — ui_smoke is 122 s of it, the slowest gate in the set and the one to watch.

**The navigation lane is done.** K1 put every camera movement on the screen, K3 put them on both
mouse buttons and took the pointer, K2 made the keyboard a rate, K4 answered "where am I", and K5
made all of it fit in a hand. Next is the world lane, S9 first.
