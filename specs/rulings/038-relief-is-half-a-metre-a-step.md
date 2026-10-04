# Ruling 038 — Relief is half a metre per elevation step, and roads are corridors

- **Date:** 2026-09-05
- **Source:** P37 — D7, the recommendation accepted; answers Q24
- **Status:** ruled

## Question

Elevation is a u8 per tile drawn at `HEIGHT_SCALE = 0.02` tile units, about a sixth of a tile
across a whole map, because "full relief at city scale reads as noise and makes roads look
broken". The reference has hills a block tall. How much relief, and what stops the roads
breaking?

## Ruling

**`RELIEF_M = 0.5`** metres per elevation step, so the u8 range spans 128 m and a worldgen map
with its usual eight levels of spread has hills about four metres tall — a slope you can see,
that a road climbs, that a building has to be seated on.

Roads do not break because **a road is a corridor**: inside a corridor's half-width the ground
is the corridor's own centreline height, blended out over a few metres with a smooth weight;
junctions average. The height function is one function, `heightAt(x, z)` in
`client/world/`, and every ribbon, prop, kerb, marking, overlay quad and building samples it.
Buildings are seated on the **lowest** corner of their lot and a plinth makes up the
difference. Picking marches the ray against the height field.

Worldgen, `tiles.elevation` and the hash do not change: the constant is applied by the
renderer.

## Why

Both fable51 worlds have real slopes — Powell climbs toward Nob Hill, Higashiyama rises 76 m
over the route — and neither has a broken road, because neither lets a road decide its own
height. The failure the original decision feared came from drawing a road as a flat quad at
its tile's height on a surface whose corners are averaged (N28, N30); the corridor is the
general fix, and the flattening it does across the road is what a road cut into a hillside
actually looks like.

Half a metre rather than a block because overlays, zone tints and the territory overlay are
flat tinted quads, and at a block of relief they either become ribbons or fight the ground.
Half a metre is enough for hills to read as hills under a perspective camera (034) and small
enough that the flat layers can be re-checked one by one (V4's definition of done).

## Amended at S11 (A87, 2026-10-03) — a junction may move

R3 added the second half of this ruling (A42): node heights are fixed at the land, and the street
between two of them is graded to `road.maxGrade`. That holds until the land between two junctions is
steeper than any street may be — on `hilly` 128, **485 of 1,458 corridors**, where `gradeProfile`
gives up and draws a straight line at whatever the land demanded, and the walker meets 177 cliffs.

So a junction gives way too, within `road.junctionDrift` of its own ground (6 m), relaxed against
the same graded run the profile uses. It is a cutting and an embankment, not a road on stilts: every
lot, lawn and walker still reads the land, and on `rolling` — the terrain every other gate measures
— it moves **3% of junctions, by 1.19 m at worst**, while taking the last 8 ungradeable corridors to
none. `junctionDrift: 0` turns it off, so one harness can measure the before and the after.

It is not enough to make `hilly` playable on its own: at 6 m the walked route still meets 30 cliffs
and 226 corridors are still ungradeable (Q134).

## Amended at S12 (2026-10-03) — the shore is a bank, and a road is not on it

S4 capped the water at its lowest dry neighbour and cut a channel under it, which ended the river
painted across a hillside; what it left was a cut **one tile wide**, so where the land stands high
the shore fell 7.44 m over 20 m. That is 37% — a quay wall, and a cliff the walker cannot climb.

The cut is `water.bank` tiles wide now (3), and it lives in `landAt`, which makes it part of the
LAND rather than a late clamp: the ground is the water's own level at the waterline and the bare
land `bank` tiles inland, eased between the two, and a point already at or below the water is left
alone. It only ever cuts.

**The road is not on the bank.** `pavableAt` — what a corridor's profile is graded from — reads the
BARE land, not the cut. Grading the approach from the cut dragged every street that reaches water
down to the waterline: on the bridge fixture the carriageway dived 3.9 m into the channel and the
walker was stopped at the abutment. A road at a shore is on an embankment above the beach, which is
what the corridor blend already draws.

Measured over three generated regions, as the share of shores climbing more than 15% in their first
tile: **41% / 50% / 48% at bank 0**, 14/11/22 at 2, **7/1/14 at 3**, and 7/1/14 at 5 and at 8 — so 3
is the knee, and past it the cut only eats more land. What is left is terrain: a hill that meets
water is a sea cliff, and no fixed-width cut can flatten one without flattening the map.

## Consequences

- Slice V4: `heightAt`, corridor flattening, seating, height-field picking, and every flat
  layer — markings, zone tint, lawn, overlays, ghost — re-checked for the seam class of bug at
  full relief.
- `terrain.js` builds its mesh from `heightAt`, dips `STREET_DIP` under a corridor, and blends
  colour across natural tiles only (V3).
- Water tiles clamp to a water level.
- Ruling 030's amendment ("a flat layer at its own tile's height does not meet its neighbour")
  becomes the test for every layer at `RELIEF_M`.

## Enforced by

- `specs/engine/04-city-model.md` §4.2, `05-ground-and-streets.md` — the height function and its rules
- `data/cityviewer.json` — `reliefM`, and `road.maxGrade` (after R3)
- `test/grade.test.js` — the profile obeys the limit, keeps the climb, pins the junctions and levels their boxes
- `tools/walkthrough.mjs` — reports the steepest street and how many corridors are beyond grading
- `test/world.test.js` — a corridor is level across its width; a building's seat is the minimum of its corners (after E0/V4)
- `tools/play_shot.mjs` — the overlay-on-a-slope viewpoint in the capture list

## Amendment (A42, ruled by measurement in R3, 2026-09-07)

Kjell: *"Hills can be taller, but streets to max 15%."* Both halves were done; the two turn out
to be in tension, and the measurement settles it.

**Streets are graded.** `client/world/grade.js` smooths every corridor's profile between its two
junctions to `road.maxGrade = 0.15` with cut and fill, and `heightAt` inside a corridor reads that
profile rather than the land under it. A junction's height is fixed — it is the land there, shared
by every corridor meeting it, because two streets that disagree about it is a step in the road —
and the junction box itself is level, capped at a sixth of the street at each end. On the saturated
96×96 the steepest street went **37.1% → 18.8%**, the walker's worst ground jump 0.86 m → 0.40 m
over 2 m, and 8 of 773 corridors are left over.

**`RELIEF_M` stays 0.5.** Measured on one seed grown for twenty years, three terrain styles, and
the streets graded:

| terrain | relief | tallest ground | streets that cannot make 15% | steepest street |
|---|---|---|---|---|
| flat | 0.5 | 25 m | 0 of 2,054 | 5% |
| flat | 1.0 | 50 m | 0 of 2,054 | 9% |
| rolling | 0.5 | 61 m | **8 of 2,095 (0%)** | **16%** |
| rolling | 0.75 | 91 m | 82 of 2,095 (4%) | 24% |
| rolling | 1.0 | 121 m | **256 of 2,095 (12%)** | **32%** |
| hilly | 0.5 | 104 m | 934 of 2,161 (43%) | 71% |
| hilly | 1.0 | 207 m | 1,455 of 2,161 (67%) | 141% |

At a metre a step, one street in eight on an ordinary rolling map is steeper than the limit Kjell
had just set, and the steepest doubles. `reports/smoke-R3-relief05.png` and `-relief10.png` are the
same frame at both: 1.0 is unquestionably more dramatic at city zoom — the town climbs a hillside
and the far shore has hills on it — and at street level the same city is a road falling off a cliff
with the baked chunks tearing across it. **A place you can stand in beats a place you can only look
at**, so the taller hills are refused for now, on the numbers rather than on taste, and the one
number that reverses this is `reliefM`.

Note what the table also says: **`hilly` is beyond grading at any relief** — 43% of its streets
cannot make 15% at 0.5 — because the land between adjacent junctions is simply steeper than that
and node heights are fixed. That is a worldgen or a node-height decision, not a renderer one
(**Q64**).
