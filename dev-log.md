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
