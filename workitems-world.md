# world — work items

*Written 2026-09-10 from Kjell's P59: "make the 3d world more detailed." The cityviewer lane
built the machinery — a derived model, a baker, four fidelity levels, a painted style — and left
the CONTENT at one silhouette per idea: every civic building is the same civic kit whether it is
a coal plant or a park; the ground is eight flat colours; a river is a trough with a road laid
across it; nothing moves but cars and people; the town runs to the edge of the map. D4's compare
sheet said what the eye sees first — ground colour, no edge to the town, low-chroma roofs, streets
wide for their houses. This lane is content, item by item, each with the compare sheet as its
gate. Same rules as `workitems-cityviewer.md` §0; art rules from `specs/art-direction.md` §3 and
`specs/engine/06`; **every item that adds a new KIND of geometry re-measures the tier budget it
lands in and records it** (E5's lesson). Kjell judges by eye against a reference (memory): shoot
it at the zoom the item is about, look, and iterate with the render in front of you.*

**What every item must keep:** no binary assets (ruling 032/D5 — geometry and Canvas2D only); the
L2/L3 agreement (a chunk drawn instanced and a chunk drawn baked show the same building); the
per-tier budgets in `data/cityviewer.json` or an amendment to ruling 040 with the number; no
fixture hash moves. **Detail goes where the eye is**: the street camera and `city 20t` first
(D8's rows), silhouettes only at `city 80t`.

## S1 — Civic buildings drawn as what they are (M) — **done 2026-09-11 as `slice-S1`, with B2**

**Goal.** A coal plant looks like a coal plant. Twelve catalogue definitions, twelve kits.

**Do.** `client/render/building-kit.js` and `client/world/facade-spec.js` grow a kit per
`engine/catalogue.js` definition, keyed by `building.def`, not by category: coal plant (turbine
hall, two stacks, coal heap), gas plant (hall, one stack, tanks), wind turbine (mast and three
blades — the blades turn, S6), solar plant (panel rows on a frame), water pump (a hut on a pier at
the shore), groundwater pump (hut and a tank), water treatment (round tanks and rails), water
tower (tank on legs), fire station (red doors, a drill tower), police station (blue lamp, a yard),
hospital (a cross, taller, a ramp), park (**no building** — lawn, a path, benches, a tree ring,
S5). L2 gets an instanced silhouette per definition; L3 goes through the baker like every lot.
`params.js` carries the definition so the two levels agree.

**Tests first.** `test/kit.test.js`: twelve distinct silhouettes by vertex hash, one per
definition, and the L2 box's footprint matches the L3 kit's; `client_smoke` prints the count.
**Gate.** `budget_gate` unchanged on the saturated fixture (it has no civic buildings — say so) and
a new row on the deputy 64×64 at `city 20t` on the big viewport. `reports/smoke-S1-<def>.png`
from the pavement, twelve of them, looked at.

**In:** `client/world/civic-spec.js` — twelve shapes as lists of MASSES in unit space, which both
fidelities read: the instanced box at city zoom and the baked facade at street level are the same
coal plant by construction rather than by two people drawing it twice (E5's rule). A civic
building's "variant" is now its DEFINITION's index, so the pool keying needed no second scheme.
`civicSpin` turns each shape so its entrance faces the street.

**Four things this turned up.**

- **A hospital photographed from the north was a blank ward wall.** The masses are authored with
  the entrance on +z, because one of the four sides had to be chosen, and nothing turned them —
  `civicSpin(lot.frontage)` does, at both fidelities.
- **The harness could not photograph a building that does not exist yet.** `shoot.html` grew
  `place=<def>`, which builds a road and puts one through the REDUCER before the camera is placed,
  plus `age=` and `wear=` for B2's three states. A picture of a building the rules refused is a
  picture of nothing, so the tool reports the result code.
- **Every definition is set back by its own size** in that harness. A fixed gap frames a water
  tower and a hospital completely differently: one tile put a 3×3 wall across the whole frame and
  two tiles put a 1×1 at the far end of it.
- **The park's lawn was a lid.** At the full lot it covered every ground pixel of its tile, and an
  overlay is a texture on the ground (ruling 041) — so a park showed no pollution and no land
  value at all.

## S2 — Ground that is somewhere (M) — D4 findings 1 and 2, Q73 — **built 2026-09-12** (`specs/engine/05-ground-and-streets.md` §5.1b)

**As built.** Fields in blocks round the town (`countryside.js`), two grass tones, a wet shore, an
empty plot drawn as ground with a kerb in its zone's colour and a sign, stones, reeds, undergrowth
and hedgerows priced at the rate they are drawn, and the grass moved toward the reference by
measurement (#48a038 → #78b058 lit). The beige slab is gone from D4's sheet. Not visible yet: fields
on a city that fills its map, and stones or reeds on worlds that generate no rock, dirt or marsh
(Q98). Street-level baking of the new matter was not done — it is instanced at every zoom.

**Goal.** The land reads as country, not as a colour chart, and the town has an edge.

**Do.**
- **Terrain kinds get matter**: rock outcrops (instanced boulders on ROCK, hash-placed, three
  sizes), sand with a wet band at the waterline, marsh with reed tufts and a sheen, dirt as a worn
  path colour with stones, forest with undergrowth tufts under the trees. Two grass tones by
  noise so a field is not one green. All instanced at L2 by the prop pass and baked at L3.
- **The countryside**: beyond the built area, unzoned grass is drawn as **fields** — stripes and
  hedgerows along tile boundaries from a hash, a farm track now and then — so the town sits in a
  landscape and has a silhouette (D4 finding 2). Pure: `client/world/countryside.js` decides from
  distance-to-built (the V3 flood already computes distance-to-street).
- **Empty zoned ground** (Q73): not a slab. A zoned, unbuilt tile is a plot — kerb, gravel or
  grass, a faint zone tint at the edge only, a sign post — at L3, and the same tint at the edges
  at L2. Measured on D4's deputy city, where three quarters of zoned ground is empty.
- **Ground colour** (D4 finding 1): the palette's grass and the reference's are far apart. Bring
  `palettes.js` toward the reference for `plain` and `painted` and amend `specs/art-direction.md`
  §3.1 in the same slice — `test/docs.test.js` compares the hex values.

**Tests first.** `test/countryside.test.js`: fields never on paved, zoned or built tiles; the
pattern is a function of the tile and the seed only. `test/ground-colour.test.js`: a zoned empty
tile is not the paved colour. **Gate.** `tools/compare_sheet.mjs` re-run: rows 1 and 2 before and
after in one image, and the dev-log says what the eye sees. Budget re-measured (a new kind of
geometry on every grass tile).

## S3 — Streets with detail (M) — D4 finding 4 — **built 2026-09-13/14** as `slice-S3a` and `slice-S3b`

*S3a: crossings only where a signal or a door demand is, pipes drawn only with the water overlay,
wires thinner (A80). S3b: the street's furniture, name signs, bays, wear and the props. Widths are
**Q102**, which is Kjell's and moves every house and street shot.*

**Amended 2026-09-13 (review after S5).** Two things from the pictures join this item: **crossing
bars only where a signal or a door demand is** — T1 kept them at every junction and from the air a
dense grid is white bars — and, **A80 (Kjell, 2026-09-13)**: pipes drawn only while the water
overlay is on, through the overlay texture rather than instances, and wires thinner and greyer at
city zoom, so a street from the air is a street and not a wiring diagram. Test: `client_smoke`
reports zero pipe instances with the overlay off and the water overlay's byte plane marks every
piped tile; `a11y_smoke`'s water-overlay contrast row still passes. Both are small and both are
the first thing the reference does not have. **Built 2026-09-13 as `slice-S3a`** (spec §5.3–5.4): `crossingWanted` —
a signal, or a shop's or civic door drawing people on an arm; no pipe instances, the water overlay
shows them; the wire 0.09 of a tile and greyer. The rest of S3 below: **built 2026-09-13 as `slice-S3b`** (spec §5.4b) — junction
bollards and a street-name sign, manholes, drains, post boxes, a bench and a bike rack outside each
shop, parking bays in front of the shops with cars in them, stop lines and lane arrows at the
lights, and wear down the lanes; the solid props are colliders. **Not built:** the widths, which
became **Q102** (the three knobs cannot change the air view, where D4 saw it), and the bridges,
which go with S4.

**Goal.** A street from the pavement has the things a street has, and reads at the width of its
houses.

**Do.**
- **Width against the houses**: the reference's carriageway is about a house wide with gardens
  either side; ours is wider with thinner gardens. Measure both and decide with `road.width`,
  `road.sidewalk` and `lot.setback` — a data change with a screenshot pair, not a code change. It
  re-baselines `walkthrough` and `passability`.
- Street furniture: manholes and drains in the carriageway, lane arrows and stop lines at
  signalled junctions (bars exist), **street-name signs** on a post at each junction (a name per
  corridor from the region's name list, hashed — data, i18n-neutral), bollards at corners,
  bins exist, benches on commercial streets, bike racks, a post box. Parked cars in **bays** on
  commercial streets rather than mid-carriageway, in the same pool.
- Road surface: a wear tone down the lane centres and a patch or two per block, as a second
  vertex colour on the ribbon — no texture.
- Bridges (with S4): a corridor over water becomes a **deck** with abutments and a railing, at
  the water level plus a clearance, instead of a causeway; the walker walks it.

**Tests first.** `test/street-furniture.test.js`: every new prop is placed by a pure function
with the collider derived from the same one (A43); a bay never overlaps a driveway. **Gate.**
`walkthrough` and `passability` re-baselined with the new widths; `reports/smoke-S3-street.png`
beside D4's reference row 3; the chunk triangle count before and after (V8: 33.7k a chunk).

## S4 — Water, banks and bridges (S) — Q65 (A50), A46 — **built 2026-09-14** (`specs/engine/05-ground-and-streets.md` §5.5)

*As built: the surface capped at its bank (159 flooded tiles on seed 1003 → 0), depth as a field so a
narrow river has a channel, and one sheet with shared corners so the seams and the cross-hatch are
gone. **Not** in it: the bridge, because no road can cross water — `isBuildable` refuses it and five
played cities had zero road tiles on water, so the causeway path of Q58 is unreachable too (**Q104**).
And the bank is one tile wide, so where the land is high it drops steeply — a quay rather than a
graded slope; a wider cut is a picture decision if a shot ever needs one.*

**Amended 2026-09-13.** The surface shows its tiles — seams and a cross-hatch in `smoke-S2-edge.png`.
One mesh with shared vertices and a per-vertex level blended across a tile's corners, the way the
terrain's corners are, so a lake is one sheet; the river's step-down stays.

**Goal.** A river has banks and a bridge, a lake has a shore, and the walker can stand on both.

**Do.** R3's `gradeProfile` pointed at the water layer: a river corridor cut into the height
field with banks (Higashiyama's `addCut`), reeds at the edge (S2), a wet-sand band; bridge decks
where a road corridor crosses (S3). A lake keeps E8's shelf. `collision.floorAt` knows the deck.

**Tests first.** `test/water.test.js`: the bed under a river is below both banks; a bridge tile's
surface is the deck, not the water. **Gate.** `walkthrough` walks every bridge; `reports/smoke-S4-{river,bridge}.png`
from the bank and from the deck.

## S5 — Trees, gardens and parks (M) — **built 2026-09-13** (`specs/engine/06-buildings-and-kit.md` §6.6c)

**Goal.** Vegetation with variety, and a park that is a park.

**Do.** Species from three to six by terrain and zone (a street tree in a pit on commercial
streets, a conifer on rock, a willow at water, an orchard row in a garden); gardens per house
variant (a bed, a shed, a fence type); parks (S1) with a path, benches, a tree ring, a pond on a
big one. All faceted blobs, never billboards (ruling 032/Higashiyama). Instanced at L2, baked at
L3, and the crowd's `nav.js` gets park paths as walk edges so people go in.

**Tests first.** `test/foliage.test.js`: species is a function of terrain, zone and hash only;
`test/nav.test.js`: a park's path is reachable from the pavement. **Gate.** Budget re-measured;
`reports/smoke-S5-{park,garden,street-trees}.png`.

## S6 — Ambient motion (S) — spec §9.4 — **built 2026-09-13** (`specs/engine/09-life.md` §9.4b)

**As built.** `client/world/motion.js` and a shader patch on one clock: tree sway, a turbine rotor,
stack and fire smoke, flags on public buildings, a crane on building sites — posed in whichever
frame the building was drawn in, still under reduced motion and `?life=0`. Street-level (baked)
trees do not sway: they have no per-vertex height to sway by. `tools/motion_shots.mjs`.

**Goal.** Restrained movement where the eye expects it. Nothing bounces, nothing pulses.

**Do.** Per-frame uniforms on instanced pools, no per-instance work: tree sway (a vertex offset
by height and a slow sine), wind-turbine blades (S1), a smoke column from industrial stacks and
from burning tiles (B1) — a chain of fading quads rising and drifting downwind, flags on civic
buildings, a crane that turns on a construction site (B2). Reduced motion stills all of it;
`?life=0` too, so screenshots stay byte-identical.

**Tests first.** `test/motion.test.js`: every animated pool has a still state at `t = 0` and
under reduced motion; the sway amplitude is bounded. **Gate.** two `screenshot.mjs` runs under
`?life=0` byte-identical (V1's gate, kept); `reports/smoke-S6-{wind,smoke}.png` at two times.

## S7 — Windows with something behind them (S) — **built 2026-09-24** (`specs/engine/06-buildings-and-kit.md` §6.8)

*As built: `client/world/windows.js` decides per opening — a curtain in one of three tones taken
from the wall's own colour, a blind part way down, or the room behind it — and which windows are
lit, moved out of the baker so the light and the dressing agree. A storefront gets a back wall and
a shelf. About +2,200 triangles a chunk (23,930 → 26,107 per chunk), `budget_gate` green at 288 s
of 300. **Not in it:** the painted Canvas2D interior card the item mentions; the shop is geometry,
which suits the style and costs no texture.*

**Goal.** A facade at eye height is not a grid of flat rectangles.

**Do.** Per window from the hash: a curtain or blind colour and depth as an inset quad, a lit
ratio at night that follows `building.occupancy` (B2), and for shopfronts a painted interior
backdrop behind the glass (Higashiyama's `shopfront.js`: a Canvas2D shelf-and-light card, no
photographs). The E5 facade grammar already has the module; this is what it draws.

**Tests first.** `test/facade-spec.test.js`: the window treatment is a function of the building
id and window index; the lit ratio is monotone in occupancy. **Gate.** chunk triangle count before
and after; `reports/smoke-S7-{day,night}.png` from the pavement outside a shop.

## S8 — The compare sheet, row by row (S) — the TOOL **built 2026-09-24**; the judgement is Kjell's

*As built: `node tools/compare_sheet.mjs <out.png> --before <sha>` adds a middle column shot from a
git worktree at that commit, with the OLD tree's own harness — a sheet that mixes today's
`screenshot.mjs` with yesterday's renderer compares neither (R3's lesson). `reports/compare-S8.png`
is the first one: reference | 756507d | this tree. **What it shows:** S4's water moved rows 1 and 3
a long way — the before column draws the river and the lake as a dark grey grid, the after as water
with a wooded far bank. **Still open:** the roof-chroma amendment (finding 3) and the §3.1 update,
and the "every row has moved by Kjell's eye" verdict, which is **Q102**'s to unblock — street widths
move every house and street shot in the sheet.*

**Goal.** The lane's own gate: D4's five findings each have a before and an after in one image.

**Do.** `tools/compare_sheet.mjs` gains a `--before <sha>` that shoots the same views from a
worktree at that commit, and a row per finding; `reports/compare-transport-worlds.png` is
re-baselined once per S item and the dev-log names which rows moved. Roof chroma (finding 3)
lands here as a palette amendment with §3.1 updated in the same slice.

**Done when** every row of the sheet has moved toward the reference by Kjell's eye, and the
budgets in ruling 040 carry the re-measured numbers.

## S14 — The embankment has a batter (M) — **TRIED AND REVERTED 2026-10-04** (Q145)

Built twice and measured both times (dev-log). As a wider blend: shoulder cliffs 4 → 0, and the
walked street 53.5% → **71.8%** steep, because widening the blend widens a corridor's influence as
well as its shoulder. As a floor on the ground — the land may not fall faster than 1:1.5 from the
carriageway, nothing dragged: steepness untouched, and **674 of 1,376 corridors** qualified, because
a graded street on a hilly map routinely stands 2–3 m above the land. The first run of that arm
buried a lot.

**Third attempt: a stone FACING on the verge** — the cheap version of a retaining wall, a surface
rather than a structure. Built and reverted too, and for a reason outside the code: **nothing can
photograph a steep shoulder.** Four shots came back byte-identical, including one with the facing
painted magenta at a millimetre threshold — the tool had no instrument. With one: the kerb camera
bakes seven chunks and the other three bake none; a city camera cannot bake L3 street geometry at
all (21–44 tile pixels, "street detail not resolvable"); and a street camera at the deep cases on
the hilly map stands inside the embankment. Where a camera CAN stand — the rolling 96 — the rule
fires in three places at 1.7 m, which is a stone strip on a gentle slope and not a wall.

**A batter needs space, and the city is built to the kerb.** And the four cases are not hillsides:
the walk prints their positions now and all four are within two tiles of water, where the "fill" is
the depth of S12's bank cut below a waterside street. The choice Q145 now offers is a **retaining
wall** — a renderer feature that changes no height, buries no lot and re-measures nothing — or
leaving it counted. **Either way a camera comes first**: a harness that can stand beside a steep
shoulder, which nothing in `tools/` can do today.

`tools/embankment_shots.mjs` takes the three pictures (the kerb, the drop, side on) at a tile the
walk names; `reports/smoke-S14-*-before.png` are the ones taken for this attempt.

## S14 — The embankment has a batter (M) — the item as written

**The reading.** Where the land is steep, R3's corridor profile and S11's junction drift hold a
street ABOVE the land, and the height field blends back over `road.blend` — four metres. On a
played `hilly` 128 that is **up to 14.7 m of fill falling away over four metres**, a 1:0.27 face
the walker meets as a cliff at the kerbside. A real embankment batters at about 1:1.5. It is the
same shape as A120's plinth: a thing standing on a wall of its own making.

**Why it is not a constant.** `road.blend` is read by the height field every lot, lane, walk and
chunk bake asks about, so widening it on steep ground moves the ground under the whole city — it
is a slice with its own re-measure, not a number. That is why it is written here rather than fixed
in the gate that found it.

**Do, if Kjell wants it.**
- A blend that is a function of the DROP rather than a constant: `blend = clamp(drop * batter,
  road.blend, road.maxBlend)` with `batter` ≈ 1.5, so a flat city is untouched (drop ≈ 0 keeps
  today's four metres) and only the steep shoulders widen. The cost is in `heightAt`'s inner loop,
  which every chunk bake and every lane point pays — measure it with `lanes_dump` before and after.
- The lot rule has to agree: a wider shoulder eats buildable ground, and `bareLandAt` /
  `pavableAt` / `landAt` each answer a different question about the same tile (the trap
  S12 and S13 both fell into).
- `walkthrough 128 hilly` counts `shoulderCliffs` already; it is the gate.

**Measure, don't assume:** the picture is the point. The shots are the ones S11 and J3 took, and
the comparison is before and after on the same seed, not a number in a table.

## S13 — The bridge (L) — A84 (Q104), **re-scoped at P99 (A111)** — **BUILT 2026-10-03** as `slice-S13` (era 24)

*Built: `build.bridgeSpan` and `crossingRefusal` in the engine (road layer only — the first cut
applied to wire and pipe, whose BFS crosses water routinely, and stopped the deputy building
anything at all); `pavableAt` and `heightAt(x, z, deck)` in the ground; a per-point depth on
`skirt` for the girder; the riverbed's own colour back under the deck; and the deputy spanning a
river it can reach the far bank of. Ruling 047 is the decision; `walkthrough` walks 1,356 steps of
deck over 15 legs on a played 96 with nothing refused.*

*Two things the slice found that the work item did not ask for. The gate cities contained **0 road
tiles on water** — the deputy meets water fifteen times in twenty years and a building on the far
bank refused all five attempts — so `saturatedCity` lays one crossing on purpose and throws if it
cannot, and `walkthrough` fails if a city with a bridge in it never walks one. And the hulls that
pass beneath were literals inside `instances.js`, where no test could compare them with the
clearance they depend on; they are data now.*

*Kjell took the expensive option in P93: a deck with clearance, not a causeway on the shallows.*

***The crossings already exist.*** A84 was written on the understanding that no player and no deputy
had ever paved one — 0 road tiles on water across five played 64×64 cities. That was true of 64 maps.
H7's played fixture has **10 road tiles standing on shallow water in a 96 city**: the engine has
always allowed it, `placeNetwork` charges `build.roadOverWater` for it, and the renderer drapes the
road into the shallows — so each bank is a **0.72 m step**, which stopped `walkthrough`'s walker 939
times in one run and is counted under its own name in that gate now.

*So the first job is not the crossing RULE. It is the **deck**: a run of road over water gets a
surface at a fixed height above it, a ramp at each end inside `road.maxGrade`, clearance under it for
a boat, and a floor `collision.floorAt` will give the walker. The engine half shrinks to a span limit
(`build.bridgeSpan`) and the question of whether a crossing may END on water; the renderer half is
unchanged and is still the L.*

**Goal.** A road crosses water, and the city on the far bank is part of the city.

**Do.** `isBuildable` is not the lever — a bridge tile is a ROAD over water, not buildable ground —
so the engine gains a crossing rule of its own: a road run may cross `TERRAIN_WATER`/`SHALLOW` where
both ends reach land within `build.bridgeSpan` tiles, charged at `build.roadOverWater` (which the
ruleset already carries and already charges). The renderer gives the run a DECK at a fixed height
over the water surface with a ramp either end inside `road.maxGrade`, and `collision.floorAt` knows
the deck so the walker crosses it rather than drowning. Anything that passes beneath — a boat
(T4b) — reads the clearance.

**Everything that reads the height field reads this**: the corridor profile, the lane graph, the
lots either side, the walker, the ground colour under the deck. That is what makes it an L.

**Tests first.** `test/build.test.js`: a run from bank to bank is accepted and charged at the water
price; a run that ends ON the water is refused; a span longer than `bridgeSpan` is refused.
`test/water.test.js`: a bridge tile's surface is the deck, not the water, and the water under it is
still water. `test/lanes.test.js`: the lane graph crosses it as one corridor rather than two.

**Gate.** `sim` on a new era — the deputy will cross rivers, which changes where every town grows —
plus `walkthrough` over every bridge, `budget_gate` for the deck geometry, and
`reports/smoke-S13-bridge.png` from the bank, from the deck and from a boat passing under it.

## S11 — Steep ground you can play on — Q80 (A57), A87 (Q64, Q74) — **PART BUILT 2026-10-03** as `slice-S11`

*Built: a junction's height may move within `road.junctionDrift` (6 m) of its own ground, relaxed
against the same graded run `gradeProfile` uses, before the profiles are built. Ruling 038 is amended
with it.*

*Amended 2026-10-03 at H6: the steep half S11 left unbuilt is now the reducer's rule (`canZone`
refuses a slope past `development.maxZoneSlope`, era 20), and `walkthrough 128 hilly` still reads the
same — because the saturated fixture does not grow from zoning. Its buildings are pushed into the
array on any tile, cliff or not (Q72), so the gate measures a city the rule never touched. The gate
becomes meaningful with **H7**.*

***Met at A119 (2026-10-03).*** `walkthrough 128 hilly` is green and back in the `render` set — not
because the ground got better but because the gate stopped counting the terrain as a defect: a cliff
on a corridor no grading can flatten is the land (4 of them), and a lot the walker stands on top of
is a building buried in a hillside (4, deepest 8.0 m, which is Q144). What is left over is 0.

*Moved a long way at J3 (era 22, 2026-10-03) and NOT met. What was missing was not the junctions: it
was that `placeNetwork` had no slope rule at all, so the deputy paved up a 500% hillside and the
walker met what it paved. With the rule, `walkthrough 128 hilly` went from 25 cliffs and 218 of 612
ungradeable corridors to **4 and 205 of 929** — 36% of corridors to 22%.*

*It read ZERO cliffs at era 22 and joined the `render` set on that run; era 23's economy moved what
the deputy builds and it was red again the same night, with no change to the rule. The gate's criteria
are absolute and the city is not, which is **Q142** — so the walk is a tool you run and read, and this
done-when stays open.*

*Not met at S11: the done-when. `walkthrough 128 hilly` is **red** — 30 cliffs, 226 of 1,458 corridors
ungradeable — so it has not joined the `render` set. Before this slice the gate **could not be run at
all** on that terrain: `saturatedCity` threw "a rail line was asked for and none was laid", because
its `land()` predicate did not know that `placeNetwork` refuses ROCK and the rail row carries twelve
rock tiles. That is fixed, and the baseline it then printed (177 cliffs, 485 ungradeable, steepest
street 98.1%) is the first honest reading this question has ever had. The remaining corridors are
20 m long with 10 m of land between their ends, and no cutting fixes that at 15%: **Q134** is the
choice between a deeper cut, a steeper street and worldgen refusing to zone the cliff.*

*On `rolling` 96 — the terrain every other gate measures — the rule is a clear win and no regression:
ungradeable 8 → 0, samples over 15% 220 → 46, steepest street unchanged at 18.8%, cliffs still 0.*

## S11 — Steep ground you can play on — Q80 (A57), **and Kjell confirmed it is wanted** (A87: Q64, Q74)

Kjell: *"whichever is easiest, allow steep ground."* So `hilly` stops being scenery and the cheap
route is the renderer's: **a junction's height may move within the grade limit**, iterated in
`client/world/ground.js` before the profiles are built. No hashed state — node heights are derived
— which is what makes it the easy half. Worldgen refusing to zone steep ground stays unbuilt.

It settles **Q74** in the same move: the 80 cliffs `walkthrough` finds on a 128 `hilly` map are the
walker's side of the same number. **Done when `walkthrough 128 hilly` is green and joins the
`render` set** — the measurement is what says whether moving junctions was enough, rather than the
claim that it was. Today it is 459 of 1,392 corridors ungradeable and a steepest street of 59.3%.

## Review after S1 (2026-09-11) — P63

*Read on `dev_night` at `7fd3f02`. Re-run by the reviewer: the suite twice, `gates.mjs quick`
and `gates.mjs render` — numbers at the end. **K4, K5, S9 and S1 with B2 are accepted** as
built: the pure modules are the right shape (`house-spec`, `civic-spec`, `age`, `fit`), the salts
on the chunk hash are the right mechanism, and the budget discipline in S9 — flat things flat, the
furniture in three chunks — is exactly what E5's lesson asks. But the review's job is the
picture, and the pictures say the two slices did not reach the reference.*

**What the screenshots show, looked at by the reviewer.**
- `smoke-S9-street.png` and `-garden.png`: a street of flat-roofed two- and three-storey slabs
  with a dark parapet, no chimney against the sky, no porch, no fence, no shed — the "garden"
  shot has water on both sides of the road and no garden in it. The furniture is there in the
  numbers (126 triangles a house) and not in the frame, because the buildings it lands on are not
  houses. **Q93 is answered by measurement (A71): the kit, not development.** Most homes in a
  played city are one- and two-tile lots at level 1 or 2, and every one is drawn as a block
  filling its lot. → **S10**, first.
- `smoke-S1-coalPlant.png` and `-hospital.png`: a grey box beside a taller grey box; a grey box
  with six windows. **Q95 is answered by probe (A73): the baked path is reached** (three live
  chunks; the count falls by 360 as the box leaves and the masses arrive), so the picture is the
  kit. Every mass of every definition is one concrete tone; the recognising parts — stacks,
  cross, doors, lamp — are the same colour as the walls, and at the pavement's distance they
  vanish. → **S1b**.
- `smoke-S9-city20.png`: the city from `city 20t` reads well — roofs in four colours, trees,
  cars on the roads — and the empty zoned grid at its edge is the grey slab Q73 describes,
  unchanged. S2 stands.
- `smoke-B2-abandoned.png`: a near-black box. Grime at 0.72 still reads as a black building
  from the pavement in this light; the boards are not visible at all. B2's tone wants the same
  screenshot loop S9 got — one more iteration, in S10's slice, since it touches the same walls.

**Q94, the budget**, is answered (A72): the High budget goes to **400,000** on the 4090 card's
evidence, not the detail down.

**Measured by the reviewer:** suite green twice; `quick` 11 of 11 in 372 s of 480; `render` went
red on `budget_gate` once — while the reviewer's own Q95 probe was drawing beside it — and green
alone (`budget gate ok`), which is M2's one-set-at-a-time rule confirmed from the other side.

## S10 — The density ladder (M) — A71 — **done 2026-09-11 as `slice-S10`**

**Goal.** A level-1 lot is a house with a garden, not a slab. The city grows exactly as it does;
only what a lot at a given level *draws* changes. Renderer-only, no hashed state.

**Do.** In `client/world/params.js` and `facade-spec.js`, a **form per (footprint, level)**:
- **level 1**: detached — one house per tile of frontage, 9–11 m wide and 8–10 m deep, one or two
  storeys with a pitched roof (gable or hip, never flat), gardens front and back, a fence or hedge
  between neighbours; a 2×1 lot is two houses side by side, a 2×2 lot four round a shared back.
- **level 2**: semis or a terrace — the tile's frontage as two joined houses or a run of three
  narrow ones, two storeys, pitched, small front gardens, a shared party wall.
- **level 3**: low flats — the lot's width, three storeys, a flat or shallow-hipped roof, a
  communal lawn, bins and bike shed (S3's props).
- **level 4+**: the block the kit draws today.
- `storeys` stays `1 + level` only from level 3; below it the form decides. The L2 instanced box
  becomes **one box per house** at level 1 and 2 (the pool count grows; measure it), so the
  silhouette from the air matches the pavement (E5's rule). S9's furniture lands on whatever the
  form is, unchanged. B2's grime and boards get one more screenshot pass here: a derelict house
  is a house with boarded windows and a grey wash, not a black box.

**Tests first.** `test/params.test.js`: the form is a pure function of `(w, h, level)`; a level-1
2×1 lot yields two houses whose footprints do not overlap and sit inside the lot; every level-1
roof is pitched. `test/kit.test.js`: the L2 pool count per lot equals the form's house count.
**Gate.** `budget_gate` re-measured (more, smaller buildings — the count moves both ways); the
S9 shots re-taken by `tools/house_shots.mjs` on a **played** city (`years=40`, not the saturated
recipe — Q72), and looked at against the reference: chimneys against the sky, gardens between,
a street that reads as a street of houses. `reports/smoke-S10-{street,garden,city20}.png`.

**In:** `client/world/homes.js` — `homeForm(widthM, depthM, level)` in lot-local `u`/`v` and
`houseLots(lot, level)` mapping it to sub-lots in world metres by the lot's own frontage. A sub-lot
IS a lot, so the facade grammar, S9's furniture and the props all work on it unchanged, and the
instanced pass pushes one box per house from the same function. Eight assertions in
`test/homes.test.js` — including that a house is 9–11 m wide IN METRES whatever the lot is, which
is the rule a fraction-based form would have broken.

**Three things this turned up.**

- **The sizes have to be in metres and the placement in fractions.** A form expressed only in
  fractions gives a 34 m lot a 34 m house, which is the slab again; one expressed only in metres
  cannot be mapped by frontage. `homeForm` takes metres and answers in fractions.
- **The camera stood inside a hedge**, because `house_shots.mjs` aimed at "a road tile next to a
  house" and a played city has tiles that are a road AND carry a `buildingId`. The shot came back
  with a green slab across the top of the frame. It now requires the standing tile to be clear.
- **And the shot had to look ALONG the street.** Facing the houses was right while they were slabs
  set back behind a garden; with the ladder they stand near the kerb, and a camera pointed at one
  is inside its front wall.

**Two more from the omissions sweep on the slice itself.** Every house on a lot shared the
BUILDING's id, so everything that hashes on it — the chimney, the shutters, the lit windows —
made a terrace four copies of one house; `houseIndex` salts it, and the colour still comes from
`params` because a terrace is one terrace. And `party` was set by the form and read by nothing: a
joined house's side walls are now unglazed, because a window in a party wall looks into the
neighbour's living room.

**Measured.** Street chunks **282,474 → 275,248** over 8 (smaller houses, less wall), the crowd
frame **301,980 → 329,464 of the new 400,000** (more, smaller instanced boxes), bake p95 6 ms.

## S1b — Civic buildings you can tell apart (S) — A73 — **done 2026-09-12 as `slice-S1b`**

**Goal.** From the pavement, a coal plant is a coal plant before you read the inspector.

**Do.**
- **A material per mass** in `civic-spec.js`: each mass names one of a small set — `brick`,
  `concrete`, `steel`, `white`, `red`, `glass`, `tank` — and `civic-parts.js` colours it from the
  palette per style (the painted style keeps its ramps). Coal plant: brick hall, steel stacks
  with a dark rim, a black heap. Hospital: white ward, a red cross two storeys tall on the
  street face, a glass entrance. Fire station: red doors on a brick front. Police: a blue lamp
  and a sign. Water tower: a steel tank on concrete legs. Wind turbine: a white mast and blades.
- **A sign**: the definition's name on a board at the entrance through `signs.js` (the shopfront
  signs exist; the civic ones use the same canvas, localised).
- **The recognising part sized to be seen**: a stack is a cylinder (eight sides) proud of the
  hall by half its height; a cross is a metre thick; the entrance canopy spans the door.
- Age (B2) multiplies these as it does the walls.

**Tests first.** `test/civic-spec.test.js`: every mass has a material from the set; the hospital's
street face carries the cross; no definition is a single material. **Gate.** the twelve
`smoke-S1-*.png` re-taken and looked at; `budget_gate` unchanged within 2%.

**In:** a `mat` on every mass from a set of nine, resolved per style in `palettes.js`
(`civicColour`) and as a per-vertex shade in the instanced kit (`shadeOf`); one sink per material
in `civic-parts.js`; a sign board over the entrance through the existing sign canvas, from
`buildingLabelKey` in the game and `defaultName` in a harness that has no catalogue; stacks as
drums that clear their hall, a cross on the street face, doors the height of the appliance bay.

**And the finding that was hiding behind all twelve pictures: the chunk the camera stands in was
never baked.** `inView` samples a chunk's centre and four corners against the visible bounds, and
every one of them can be outside the wedge while the chunk's interior — the ground the player is
standing on — is inside it. So the buildings CLOSEST to the camera were drawn as instanced boxes,
in every street-level screenshot this project has ever taken. That is why S1's twelve shots showed
one concrete tone whatever the spec said, and why A73's probe (a 360-triangle drop) was reading the
roads rather than the building. `holdsCamera` is the fix; `street-chunks.js` reports which chunk
keys are live now, because "3 live" could not answer "is the building in front of me one of them".

**Measured.** Street chunks **275,248 → 226,232** over 8 with 9 groups (the near chunk joins and a
distant one leaves), the crowd frame **329,464 → 310,885 of 400,000**, bake p95 5 ms.

## Review after S5 (2026-09-13) — P68

*Read on `dev_night` at `8c0a99e`. Re-run by the reviewer: the suite (red on two docs checks only
— Q99 was in the local questions file and not in `plan-v1.md`, and the release count; both fixed
in this round), `gates.mjs quick` and `render`. **S10, S1b, B4, B7, B8, S2, S6 and S5 are
accepted.** This is the round the world lane turned: `smoke-S10-street.png` is a street of houses
with pitched roofs and chimneys against the sky, `smoke-S10-city20.png` reads as the reference at
distance, `smoke-B4-morning.png` is a queue of cars at a junction on a street of houses, and
`smoke-S5-park.png` is a park. S1b's finding — the chunk the camera stands in was never baked —
is the most important thing found since R4, and it corrects the reviewer's own A73.*

**What the screenshots show, looked at by the reviewer.**
- **The civic sign floats.** `smoke-S1-coalPlant.png`: a black bar hangs in the air left of the
  tree. `signs.js` puts a civic sign on a fascia at the LOT's street edge (`fasciaQuad(spec,
  front, …)`), and a civic building's masses are set back inside the lot — so the board stands in
  the garden, edge-on and unlit. → R5.
- **The coal plant's drum stands beside the hall, not over it**; from the pavement it is a silo.
  The hospital's cross reads; its glass entrance is a dark strip along the whole front. S1b did
  what it said and the shapes want one more pass by eye — the same loop S9 and S10 got. → R5.
- **Every junction has a zebra on every arm**, and from the air a dense grid is white bars
  (`smoke-S5-garden.png`, top left). T1 kept crossing bars at unsignalled junctions on purpose;
  the picture says that was too many. → S3 (bars where a signal or a door demand is).
- **Wires and pipes edge every road in blue and grey from the air** (`smoke-S10-city20.png`,
  `smoke-S2-edge.png`). Q100, with a recommendation; a decision for Kjell, because it changes what
  a player can see of their own network.
- **The town has no edge because the deputy paves one** — a grid of empty roads across the river.
  Q101. Not a renderer item.
- **The water shows its tiles** (`smoke-S2-edge.png`): seams and a cross-hatch on the surface.
  → S4, which was going to touch it anyway.
- **A house stands on a pale band** (`smoke-S10-street.png`, left): the plinth or the lawn quad
  showing under the ground floor as a light strip. → R5, by screenshot.
- **Cars are two boxes.** Fine from the air; from the pavement (`smoke-B4-morning.png`) they are
  the least detailed thing in the frame now. → B3 gains a car kit.

**Q99 is answered (A78)**: the bake check reads warm rebuilds and every phase. **Q98 waits for
Kjell** with a recommendation: bundle the worldgen change with the transport lane's re-pin.

**Measured by the reviewer:** `quick` 11 of 11 in **400 s of 480** (ui_smoke 128, play_smoke 86);
`render` 4 of 4 in **285 s of 300** (budget_gate 223, lanes_dump 59) — fifteen seconds of headroom.

**The `render` set is at 285 s of 300.** `budget_gate` alone is 200 s. M2's rule applies:
the next slice that pushes it over splits `budget_gate` into its own `budget` set rather than
raising the number — and `motion_shots` and `foliage_shots` stay out of any set, as the ally
decided.

### R5 — Review fixes after S5 (S) — **built 2026-09-13** (`specs/engine/06-buildings-and-kit.md` §6.1e)

Each names its test. Commit as `slice-R5`.

**As built.** (1) `civicSignFace` in `civic-spec.js` puts the board on the street face of the
nearest wall at least 3 m wide and in the front of the lot, above anything in front of it, or on a
post at the entrance (park, turbine, water tower, water works — whose control building is behind
its tanks, found in the shots); `test/civic-spec.test.js` holds it on a face and unhidden for all twelve at
three lot sizes. (2) The stacks stand on their halls, the hospital's entrance is one bay, the fire
station's bay is taller so the board clears the doors; tested. (3) The pale band was **neither**
guess: it was the facade's ground-floor band in the trim's cream, on every house — `floorBand`
makes it a course of the wall on a house (`test/facade.test.js`). The lawn quad is also no longer
drawn on baked lots (1.1 m up at street scale). (4) A78 as written — and its first reading was
red on the phase nothing had timed (a furnished chunk's lot phase at 10–24 ms), so the lot facades
and the street corridors now bake in 4 ms slices across frames: warm p95 **6.1 ms**, cold worst
**7.6 ms**. (5) Q99 was already closed.
**Found on the way:** every sign in the city was black — `makeMaterial` sets `vertexColors` and the
sign geometry had no colour attribute, since R2; and S9's porch stood half inside the house
(`atEdge`'s sign), tested in `test/house-spec.test.js`.

1. **The civic sign on the building, not on the lot.** Place the board on the street face of the
   mass nearest the frontage (`civic-spec.js` knows the masses; the nearest face at `groundH ×
   0.9` is a pure function), or on a post at the entrance where no mass touches the frontage.
   Test in `test/civic-spec.test.js`: the sign's quad lies on a mass face for all twelve; the
   twelve shots re-taken.
2. **The coal plant's stacks stand ON the hall**, proud of its roof, and the gas plant's likewise;
   the hospital's entrance is a glazed bay one bay wide, not a strip. One pass by eye per
   definition, and the shot beside the previous one in the dev-log.
3. **The house's pale band.** Find what draws the light strip under the ground floor in
   `smoke-S10-street.png` (the plinth colour, or the lawn quad's edge at `LAWN_TOP`) and fix the
   one; re-take the shot.
4. **The bake check (A78).** `street-chunks.js` records every phase's time; `budget_gate` bounds
   the warm p95 at 8 ms and the cold first build at 16 ms, and prints both.
5. **Docs sync.** `Q99` closed (A78); `plan-v1.md`'s open table and `RELEASE.md`'s count match
   `dev-questions.md` — the two docs checks the reviewer found red — and the ally's own review
   round runs `node --test test/docs.test.js` before a commit, since `dev-questions.md` is local
   and the suite is the only thing that sees it.

## Review after W6's first half (2026-10-04) — P102

*Read on `dev_night` at `33ac6e2`, 87 commits and twenty-three balance eras after the last review.
The suite is green twice on a clean checkout of that commit (1,662 tests); the working tree is red
on two checks that belong to an uncommitted slice in flight (a retaining wall: `road.wallOut` read
by nothing yet, and a stale precache). Everything landed is **accepted**: the transport lane
(T1–T7), the rules lanes (G, H, J — eras 12 to 26), the rest of world and behaviour, F2, and the
worker lane through W5. The discipline held under an unattended night: each era measured alone,
each defect older than its slice written down as a question rather than fixed silently, and W3's
"the worker bought nothing a player can see" is the kind of sentence a review exists to check and
found already written.*

**Looked at, by the reviewer.** `reports/compare-S8.png`, the storyboard, and the transport, bridge
and fire shots.

- **The town has an edge** (storyboard 005, 012): a city in countryside with a river past it. B9
  and S2 did what D4 asked.
- **The largest remaining difference from the reference is tone and proportion, not geometry.**
  On the compare sheet the reference is red, orange and cream roofs on light grey streets in lime
  grass; ours is navy, black and brown roofs on near-black asphalt, and asphalt is the largest
  single colour in every aerial frame. S8 built the tool and left the verdict to Kjell; the
  reviewer's reading is that row 2 and row 3 are still two different games. → **S15**.
- **Shops and works are flat dark slabs from the air** (`smoke-T3-train.png`): the houses got S9
  and S10, and the commercial and industrial kits did not. → **S16**.
- **The transport lane's movers are boxes**: white slabs at the marina, a blue box for a ferry, a
  cross of two slabs for an aircraft, and from the pavement a car is two flat slabs
  (`smoke-S3-street.png`). → **S17**.
- **The bridge is a row of deck slabs that step**, with no railing and no pier in the picture
  (`smoke-S13-bridge.png`), and the water under it still shows its tiles. → **S18**.
- **An awning is a roof over the camera** (`smoke-S3-street.png`, storyboard 020): a dark slab
  across the top third of a street frame, with thin posts hanging from it. → S16.
- **Building sites dominate a young city**: grey scaffold lattices are the loudest thing in
  `smoke-T3-train.png`. → S16.
- **Several shot sets predate the played fixture (H7)** and still show the one-tile road
  checkerboard (`smoke-T4-marina.png`, `smoke-B1-street.png`). Re-run `shots`, `transport` and
  `kits` and look, before any of the items below is judged.

**Measured by the reviewer**, on the working tree while the slice in flight was also using the
machine, so the times are an upper bound: `quick` 12 of 12 in **537 s of 540**, `ui_smoke` 212 s;
`render` green and **8 s over its 240 s budget**, `lanes_dump` 239 s. Three seconds of headroom and a
set over budget are both M2 findings: re-measure each alone, and if `lanes_dump` really is four
minutes it wants its census sampled or its own set — not a larger number.

**Three omissions that are not pictures.**
- **`RELEASE.md` is a release note for a different game.** It names `782e759` (2026-09-08) and
  says every commit since is a document; there have been 122 commits and twenty-five eras. `main`
  is 122 behind. → `workitems-mainline.md` **M7**.
- **`plan-v1.md`'s lane table is stale** in four rows (world "started", behaviour "written",
  transport, rules missing). Fixed in this round.
- **W6 is a multiplayer prerequisite**, not only a stall: in a room every other mayor's build
  action costs every client 115 ms and resets its traffic (both void: 58.9 ms warm since slice-W6b
  part, and life survives a build since B11). `workitems-multiplayer.md` says so and
  orders it before X3.

## S22 — A sun that moves, and a moon that takes over (M, renderer) — P109, analysed 2026-10-08 — **decided 2026-10-08 (A138): build it**

**Decided.** A **quarter arc** across the daylight band (about 0.5°/s on a 240-second day), the
four composed colour presets untouched — only the DIRECTION becomes continuous — and the moon on
its own arc through the night. **The arcs are data**: `sun.arcDegrees` (45) and
`sun.moonArcDegrees` in `data/cityviewer.json`, mirrored in `client/world/config.js`, with
`test/world.test.js` keeping the mirror honest, so Kjell can adjust the rate later without a slice.
The pieces that bake a directional tint (`tintFaces` on `slabGeometry`, `detail-kit`'s face
contrast) give it up and take the real light, so the feature is whole. Gates as analysed below, plus
the reviewer's: the compare sheet's TERRACE row at the reference's hour beside two others.

*Reviewer, 2026-10-08: the analysis is right and the constraint list is the real one. One gate to
add: the compare sheet's TERRACE row at two hours of the moving sun beside the fixed one — the
reference's shadows fall one way because it is one frozen hour, so "reads as the reference" has
to be judged at the hour the reference shows, and the moving sun is judged at the others.*

**Goal.** Shade that belongs to a time of day rather than to the map.

### What is there now, read rather than assumed

- **One `DirectionalLight`**, the key, at `(width × 0.6, sunHeight, height × 0.35)` aimed at the
  map centre (`client/render/scene.js`). **Its x and z are constants.** `applyHour` rewrites the
  position every time the hour changes and rewrites it to *the same x and z* — only `y` moves.
- **The hour is four composed presets**, not a curve: `phaseOf` buckets a 240-second wall clock
  into `day` (0–0.4), `rain` (0.4–0.5), `sunset` (0.5–0.62 and 0.9–1.0) and `night` (0.62–0.9),
  and `setTime` walks to the new one over a **1-second** fade. `sunHeight` multipliers are
  **day 1.0, rain 0.75, night 0.5, sunset 0.22** on a rig default of 120.
- **Shadows** are off at Low, 2048 at Medium, 4096 at High; `PCFSoftShadowMap`, radius 5,
  intensity 0.5. The shadow camera is an ortho box a **quarter of the map** (`reach = max(w,h) ×
  0.28`), `far: 400`, following the camera's target and **snapped to a shadow texel** so edges do
  not crawl as the view pans (spec §7.2).
- **Some geometry DOES carry a baked directional shade, and it is the one real obstacle.**
  `slabGeometry` ends in `tintFaces(box, { top: 1.0, north: 1 − 0.1 × c, east: 1 − 0.18 × c })`
  with `c = faceContrastFor(style)` — **0.65 plain, 0.3 painted, 1.3 pixel** — so north and east
  faces are darkened INTO the vertex colours, which is a fixed light direction frozen into the
  mesh. `detail-kit`'s `setFaceContrast` pulls its shades the same way. That is `specs/art-
  direction.md`'s "Face contrast 0.65 — baked shading, compressed towards flat", and it is real
  (the first pass of this analysis said no such thing existed and was wrong: `tintFaces` is called
  from one place and is easy to miss).
- **What it covers is the small pieces, not the masses:** `slabGeometry` builds the bridge deck,
  wires, ruin walls and rubble. The building masses and the baked facades take flat colours and let
  three light them. So a moving sun fights a baked tint on a minority of the geometry — and the
  answer is a decision rather than a rebake: either those pieces give up their bake and take the
  real light (the honest option, and the one that makes the feature whole), or the tint stays and
  reads as wrong for half the day on a deck. Either way it is a line to look at, not a cost.

**So the finding is exact: the sun never moves across the sky.** It rises and falls on one fixed
azimuth, which on a 64 map points from about `(+6.4, y, −9.6)` of the centre — so every shadow in
every city at every hour of every game falls the same way, and the only thing the clock changes is
their LENGTH and the light's colour. That is the flat reading P109 names: the shade is a fixture of
the map, not a time of day.

### What the feature is

1. **An azimuth that advances with the same clock the preset blend already uses.** The presets stay
   exactly as they are — they are a composition and the spec defends them ("a slider through them
   passes through hours nobody composed") — and what becomes continuous is the DIRECTION. Colour
   and intensity stay composed; the sun walks.
2. **A moon that takes the night.** The night preset is already a dim, cool, *high* key —
   `sunHeight: 0.5`, `key: 0.16` — which is a moon standing in for a sun without saying so. Naming
   it lets it travel on its own arc rather than continuing the sun's.

### The constraints this project already imposes on it

- **The light is scenery on the WALL clock** (A41/R2: ticks were the wrong clock, at the play speed
  48 of them was a nineteen-second day), and **in a room it is the ROOM's played clock** (X1c), so
  every seat is at one hour. The azimuth takes `daySeconds` exactly as `phaseOf` does, never
  `state.tick`.
- **`?life=0` freezes it**, and two frozen screenshots must be the same bytes. The sun's position
  must be a pure function of that one clock, like `MOTION`'s formulas (S6) — and like them, worth
  holding in a module node can test.
- **It never reaches state.** The renderer does not write to state and two seats must agree about
  the city, not about the light.
- **The shadow texel snap is the risk.** `followShadow` snaps the frustum to a texel so edges do not
  crawl as the view PANS; a moving light rotates the texel grid itself, which reintroduces exactly
  that crawl with nobody panning. The likely answer is to advance the azimuth in **discrete steps**
  — the light is then static for a span of frames — which is the same shape as the hysteresis
  B7's estimate needed. Measure before choosing a step count.
- **The bake is otherwise safe:** the chunk cache's facades carry flat vertex colours, so a moving
  sun does not invalidate a chunk — which is the single biggest thing that could have made this
  expensive, and it is not the case.
- **The cost is probably nil and must still be measured.** `shadowMap.autoUpdate` is three's default
  and nothing turns it off, so the map is already re-rendered every frame; a moving sun adds nothing
  per frame. What it *does* cost is a future optimisation — a static sun could render the map once —
  and that is worth writing down before it is given away.

### What has to be measured, and what is a picture decision

- **The rate is the whole question** and it is Kjell's: a 240-second day spends 40% in daylight, so
  a full 180° arc across the daylight band is about **1.9°/s**, which at street level is a shadow
  visibly sliding while the player watches. Slower is restful and may never show; faster is a
  novelty. Two or three rates, shot at street level and at city zoom, with the pictures open —
  **Q160**.
- `budget_gate` at High, sun moving against sun fixed, to confirm the frame cost is nil.
- A shimmer check: the walker's own path at a fixed camera over a minute, counting changed pixels
  along a cast edge — the instrument that would see the crawl the texel snap exists to prevent.
- `film` is the gate that can see it at all: sixty-one frames of a played city is where a shadow
  that slides between frames shows up, and no single-frame tool can have that finding.

**Tests first.** A pure `sunAt(seconds)` in `client/world/` or beside `MOTION`: zero at t = 0, a
monotone azimuth across the daylight band, the moon's arc disjoint from the sun's, and the same
answer for the same second on two machines. `test/purity.test.js` keeps it importable by node.

**Done when** a street-level shot at three times of day has shadows falling three different ways,
and `?life=0` still gives two identical frames.

## S20 — The shot tools aim themselves (S) — found while re-running them, 2026-10-04

**Converted 2026-10-06:** `window_shots`, `rail_shots`, `harbour_shots`, `civic_shots` and
`bridge_shots` all take their camera from the subject's own geometry through `tools/lib/aim.mjs`
(`trade_shots` was written that way), and `window_shots` asserts the SHOP'S OWN chunk is baked
rather than that something is — the `cx,cy` form the cache prints, because comparing it against the
cache's packed `chunkKey` fails silently every time, which it did on the first run.

**Still to do:** the second half of that bullet. `window_shots`' criteria are still the baked chunk
and a street-triangle floor; the item asks it to count **lit panes and dressed openings in frame**.
A chunk being baked is why the question CAN be answered, not the answer — and S21's defect (what is
behind a window) is exactly the kind a triangle floor cannot see. The same applies to the other
four: each prints what it is pointed at, and none counts its subject's own features in frame.

**Goal.** A picture gate points at its subject rather than at a tile somebody remembered.

`street_shots`' "facing the shop across its bays" camera stands against a wall on seed 1003: its
`FIND` asks for the nearest standing shop with a road on one side and then stands ON that road
facing the shop, which on a 3×3 corner lot is a camera inside the frontage. F2 found the same shape
three times in one evening (the longest corridor was an industrial strip, the furthest house was a
forest, the centre of mass had no works near it), and S18 found the fourth (a street camera inside
an embankment).

**Do.** The pattern `tools/embankment_shots.mjs` now uses: find the subject in NODE from the same
model the renderer draws, choose the camera from the subject's own geometry — back off along the
frontage normal until the nearest building is further than the near plane — and use the photo camera
where a walker cannot stand. Then print what has to exist for the subject to exist (baked chunks,
posed instances) and fail at zero.

**Done when** each `_shots` gate prints the thing it is pointed at and the distance it stands back,
and somebody has looked at the frames it takes.

## S15 — Tone and proportion, against the sheet (M) — **BUILT 2026-10-05**, measured

`tools/palette_compare.mjs` is the instrument the item asked for: one sieve over both halves of each
row, medians and shares per class. **Asphalt matched** (109 vs 110), **roofs 60–70 short → 36–49**
(D4's finding 3 landed), road's share of the frame **22–34% → 7–21%**, and on the lakeside row the
largest colour on the ground is green, as in the reference. Two light levers were tried and reverted
with their numbers (`hemiGround` moved nothing — it lights downward faces; `hemi: 1.3` overshot the
asphalt by nine). The grass is **57–65 short and the palette cannot answer it**: +8 of albedo bought
+5 of lit grass, which is the compression S2 saw on grass and S15 now measures on every material.

**What is left is two items, not one guess:**

## S15b — The lit response (M) — found by S15's measurement, 2026-10-05

**Goal.** A material that is raised by sixty comes out raised by sixty, or the palette is a dial
that does not turn.

**Analysis.** Lit medians move about a third of what the palette moves: the roofs went up ~60 in
source and ~25 on screen, the grass +8 and +5. Three candidates, none yet measured apart: the key
light's intensity and colour (`presets.day.key`, `keyColour`), the grade's curve
(`lift`/`gain`/`saturation` — `gain` is a multiply, so it cannot lift a dark material without
blowing a light one), and **the baker's own face shading**, which multiplies every face by a factor
for its normal (`darken(hex, factor)` in `client/world/params.js`, and the band factors in
`palettes.js`). The third is the one nothing has looked at, and it is the only one that can
compress a material while leaving the sky alone.

**Do.** Measure each in isolation with `palette_compare` — one change, one reading, as S15 did for
the two light levers — and move the one that closes the grass without moving the asphalt off its
match. `a11y_smoke`'s band separation is the floor; `budget_gate` is unmoved (colour, not geometry).

## S15c — The road is the largest colour (M) — found by S15's measurement, 2026-10-05

**Goal.** A town that reads as fields with streets through it rather than as a sheet of asphalt.

**Analysis.** Measured: the road class takes **7–21% of our frame against 4–13% of the
references'**, and the compare sheet's eye verdict is blunter than the numbers — the references are
green with roads drawn on them, ours is grey with green in the gaps. Three causes, and only the
first is colour:

1. `road.width` is 8 m per carriageway plus 2.5 m of pavement each side, on 20 m tiles: a street
   takes two thirds of the tile it runs down. The lever is per kind in `data/cityviewer.json` (and
   its mirror), and it **re-baselines `walkthrough` and `passability`**, which is why it is not part
   of S15.
2. The deputy paves a grid with a street on every block edge (B9's "a constraint concentrates the
   agent"), so the share of paved ground is a BEHAVIOUR number, not a renderer one.
3. **A zoned-but-unbuilt lot is a grey slab** (Q73), and neither the sieve nor the eye can tell it
   from asphalt. That one is a colour, and it is the cheapest of the three to try.

**Measured 2026-10-05, before building anything — and both of the item's own guesses were wrong.**

| | |
| --- | --- |
| road tiles on a played 64 | **1,561 of 4,096 — 38.1%** |
| the paved ribbon's area | **35.7% of the whole map** (water included; ~44% of the land) |
| zoned-but-unbuilt tiles | 471 — 11.5%, and they are TINTED, not grey: the sieve puts them in `roof` |
| narrowing the street 13 m → 10 m of a 20 m tile (`road.width` 8 → 6, `sidewalk` 2.5 → 2) | road's share of the frame **20.9% → 20.2%**, green 15.9% → 16.5% |

So **(3) is not a cause** — a zoned lot's tint is warm, not asphalt — and **(1) is not the lever**: a
23% narrower ribbon moved the picture by 3% relative, because at town zoom the grey is the street
GRID's spacing rather than any street's width, and it would have re-baselined `walkthrough`,
`passability`, `lanes_dump` and `budget_gate` for that. The width change was made, measured and
reverted; nothing in this item ships without a number.

**What is left is (2), and it is a behaviour item, not a renderer one.** The deputy lays a street on
every block edge, so 38% of the city's tiles carry road. The reference town has streets two or three
tiles apart with big blocks between them. That is `engine/deputy.js`'s paving rule, it moves every
sweep number in the project, and it belongs in the behaviour lane with its own era — **B14**, below
in `workitems-behaviour.md`, rather than here.

**Do.** Nothing in this lane. The item stays as the measurement that says where the grey comes from.

## S15 — Tone and proportion, against the sheet (M) — the item as written

**Goal.** The compare sheet's rows 2 and 3 read as one family. Measured, not eyeballed first.

**Do.** The method S2 used for grass (memory: match LIT pixels, not palette values): histogram
both halves of each row with one rule and move ours toward the reference, one channel at a time.
- **Roofs**: the residential set gains terracotta, orange, cream and light slate and loses the
  near-blacks; commercial flat roofs go to light grey and buff. D4's finding 3, never landed.
- **Asphalt**: lighter and cooler (the reference's streets are a mid grey), pavements lighter
  still, so a street is a line in the town rather than a hole in it.
- **Water**: brighter and more cyan at the same night behaviour (E8's lit material stays).
- **Proportion**: A113 widened the house against its street; measure road area as a share of an
  aerial frame on the played 96 before and after, and record it. If it is still the largest
  colour, the lever is `road.width` per kind (data), re-baselining `walkthrough` and `passability`.
- `specs/art-direction.md` §3.1 changes in the same slice (`test/docs.test.js` compares the hex
  values); `a11y_smoke`'s overlay contrast is the gate that says a lighter road has not cost the
  overlays their bands.

**Gate.** `tools/compare_sheet.mjs --before <sha>`: the three rows before and after in one image,
with the histograms' medians in the caption. The dev-log says what the eye sees. `budget_gate`
unmoved (colour, not geometry).

## S21 — The glass that faced the wrong way (S) — **BUILT 2026-10-05** as `slice-S21`, found in S16a's gate

A parade of shops photographed at eye height had no ground floor: signs, fascia, piers, and the
countryside under them, day and night. `facade.js` chose the winding of every backing panel,
curtain, blind, shop back and shelf from `out[0] + out[1] > 0` — a test on the outward normal
alone, while the quad is built from `along` AND `out`, which turn together in `EDGES`. The **east
and south faces of every building in the city** drew their glass facing inward, where the renderer
culls it. Since S7. One winding on all four sides is the fix; `test/window-facing.test.js` is the
claim, asserted per face from the geometry the builder returns. Pieces carry a `name` so a test can
ask for the glazing rather than guess a colour.

**Left over:** the shop's back wall is a card the width of its own opening, so at an angle you see
past it into the empty interior and out the far side — the bright slivers between the bays. One
quad per unit spanning the frontage, behind the glass, is S16b's.

## S21b — The east and south walls (S) — **BUILT 2026-10-06** as `slice-S21b`, found while re-reading S21

S21 fixed the two sites that explained the missing shopfront glass and left the biggest reader of
`out[0] + out[1] > 0` alone: `panels()`, which builds the walls. 84 of a house's 180 wall triangles
faced INTO the building — the whole of the east and south walls, on every baked building in every
city, since E5. Invisible because an untextured box's interior is the same colour as its exterior;
the giveaway is the furniture that lives on the outside face. `civic-parts.js` held the fourth copy
(B2's boarded windows), with the buried-offset sign as well. Both go through `outwardQuad`, and
`test/window-facing.test.js` asserts the walls per face. Gate: `street_shots` green.

## S20c — The mover gates stand beside what they photograph (S) — **BUILT 2026-10-06** as `slice-S20c`

`rail_shots` and `harbour_shots` photographed from the city camera, whose span floors at 8, so S17's
carriage and its moored boats were a few pixels and the only thing the frames could prove was that
something was posed. Both keep every frame they had and gain a close one:
`smoke-T3-train-close.png` (two passes — ask the page where the carriages ended up after the same
340 frames, then stand beside the line there) and `smoke-T4-berth.png` (no probe needed:
`client/life/boats.js` runs in node, so posing it into a recording stand-in says where the berths
are). Both tools build the same city in node that the page builds, like `street_shots` and
`window_shots`.

**Taken twice.** The first close frame stood 16 m from a 17 m carriage and filled the picture with
livery; the standoff is `fitDistance` on the carriage's own length now.

## S17 — Movers you can tell apart (M) — **BUILT 2026-10-06** as `slice-S17`

`client/world/mover-spec.js` (pure) and `moverGeometry` in the kit: a sailing boat (hull, tapered
bow, deck, cabin by hash, mast, sail), a moored boat with its sail furled, a ferry (superstructure,
bridge, funnel), a cargo ship (bridge aft, four or five rows of containers by hash), a carriage
(body, roof, two bogies, a window band each side) and a locomotive (cab, windscreen, short body).
All six were `slabGeometry` before. The sizes come from the config, because `boat.hullW/hullH` are
what S13's bridge clearance was measured against.

Two new pools (`moored`, `cargo`), and `test/lod.test.js` caught both the moment they existed: a
pool with no term in the estimate is a term the budget cannot trade away. They are hulls, and that
is written beside them now.

**Found and not fixed here — S20c:** `rail_shots` photographs the station and the line from the air,
so its train frame proves a carriage is POSED and cannot show what it looks like. Stand it beside
the line like `street_shots` stands on a pavement. The same is true of `harbour_shots`' marina frame,
which is a town from 200 m.

## S16c — The works gets a yard (M) — **BUILT 2026-10-06** as `slice-S16c`

`client/world/works-spec.js` and the rest of `trade-parts.js`: hardstanding over the whole lot, a
loading dock with a roller door, a name board, a tank and pallets in the service strip, gate posts.
The yard needed the parent lot's box (`sublots.js` keeps `lotBox` on every sub-lot now, since `spec`
is the SHED), and it was invisible three times before it was right — wound face-down, drawn by a
builder with no height field, and one quad across a lot with a 1.9 m fall. It is a mesh on
`model.heightAt` in the extras pass, plus a hardstanding colour on the instanced quad for the zooms
that are not baked, which is where "sheds on a lawn" was spotted.

**Left of S16 as written:** the density ladder for commerce is S16a's; the calmer building site
(scaffold on the street face only, a hoarding, one crane) is still open and belongs with B2's age
geometry.

## S16b — A shop has furniture (M) — **BUILT 2026-10-05** as `slice-S16b`

`client/world/shop-spec.js` and `client/render/trade-parts.js`: the interior behind the glass (one
quad across the whole frontage — S7's card was the width of one opening and a shopper at an angle
saw past it), the **awning** (`storefronts[].awning` was set by the grammar and read by nothing),
roof plant by hash, a delivery door and a bin store on the far side from the shop window. The
interior is not furniture-gated: a shop with no back is see-through at any distance.

Two defects found on the way, both of S21's family and both fixed here: `house-parts.js` held a
third copy of the winding test (east and south faces culled), and `panel()`'s depth counted the
wrong way, so **every flat piece of S9's house furniture had been 2 cm behind its own wall since
September** — no plinth, no courses, no shutters, no number on the door, in any shot this project
has taken. `edges.js` owns the winding (`outwardQuad`) and the depth parameter is named `proud`.

**Left for S16c (industry):** the loading dock and roller door, a tank, pallets, the name board,
the fence and gate — and the yard, which is drawn as LAWN today.

## S16a — The trade ladder (M) — **BUILT 2026-10-05** as `slice-S16a`

The half of S16 that is S10's, measured first. **The premise, in node before any code:** in a
25-year played city (seed 1003, 96²) **45 of 61 trade buildings are 20 m or more across**, the
median commercial lot is **40 m wide at level 1**, and every one of them was a single box from the
air and a single facade from the pavement — a corner shop drawn as a department store, an estate
drawn as one shed the size of a block.

`client/world/trade.js` is the ladder: shops → parade → block, shed → units → works, pure in
`(widthM, depthM, level, zone)`. `client/world/sublots.js` is the lot-local → world-metres mapping
S10 already had, moved out of `homes.js` so there is one copy of it. `client/world/units.js` is the
one question — "what buildings are on this lot?" — that the L2 instanced pass and the L3 baker both
ask, so the air and the street cannot disagree (E5).

**Measured, `tools/trade_shots.mjs`, both arms from one harness (`?ladder=0`):** the widest
commercial lot 1 → **3** buildings, the widest industrial lot 1 → **2**, and nine shop names on a
frontage that carried four stretched ones. **The triangle ratio cannot be stabilised and the gate
no longer pretends it can:** the street cache's chunk budget is a plan the quality ladder revises
against the frame's own load, so the same arm came back 261,960 (five baked chunks) and 276,678
(six) — and capturing 140 frames to settle it gave *zero* baked chunks in both arms of the works
view. The gate keeps 60 frames, prints the baked-chunk count beside every number, reads the ratio
only when both arms baked the same amount, and gates on the counts that cannot drift. With both
arms on six chunks: **179,682 → 173,330 (0.96×)** commercial and **285,134 → 276,678 (0.97×)**
industrial from the pavement, **1.11×** and **1.14×** from the air — cheaper in facades, dearer in
boxes, which is what the change is.
`budget_gate` could not see this slice at all — its saturated city paints zones one tile wide, so no
lot in it is wide enough to divide, and both arms of it are byte-identical. A fixture is not the
game.

**Found in the shot, for S16b:** *the parade's ground floor is see-through.* `addShopfront` glazes
the ground floor and there is nothing behind the glass, so a row of shops reads as a carport with
signs over it. It is not new — the slab had it too — but at one shopfront per 40 m it was a stripe
and at three it is the frame. S7 put something behind a HOUSE's windows; the commercial kit never
got the same pass. Fix it with the furniture, not before: an interior card behind the glass is one
quad per unit.

**Also found in the air shot:** *a works yard is a lawn.* The shed is set back 16% of the lot and
sits 62% deep, which is right — but what is left is the GARDEN quad, so an industrial estate from
the air is sheds on grass. The yard wants hardstanding (the same flat quad, a gravel or concrete
tone) and S16b's pallets and tanks standing on it.

**Left for S16b:** the furniture — `shop-spec.js` and `works-spec.js` in the house-spec shape, the
awning, the roof plant, the loading dock, the name board, the calmer building site. The item as
written is below.

## S16 — Shops and works with more on them (M) — the item as written

**Goal.** A high street and an industrial estate get what S9 and S10 gave a terrace.

**Do.** `client/world/shop-spec.js` and `works-spec.js`, pure, in the house-spec shape:
- **Shops**: a parapet with a cornice, roof plant (a vent, a condenser, a skylight), a rear yard
  with a bin store and a delivery door, upper-floor windows with blinds (S7), a hanging sign and
  a wall sign. **The awning is a sloped strip one metre deep over the shop window**, not a
  canopy over the pavement — measured from the pavement camera so it never covers more than a
  tenth of a street frame.
- **Works**: sawtooth and shallow-pitched roofs in light metal, a loading bay with a dock and a
  roller door, a yard with stacked pallets and a tank, a stack on the heavy ones (S6's smoke), a
  fence and a gate; a name board (S1b's sign canvas).
- **A density ladder for commerce** (S10's idea): level 1 a single shop or a shed, level 2 a
  parade or a unit, level 3 a block with shops under flats or a factory.
- **Building sites, calmer**: scaffold on the street face only and in a muted tone, a hoarding at
  the pavement, one crane per site; the lattice is not the loudest thing in the frame.
- Flat things flat, and furniture in the nearest chunks only (S9's two rules); the L2 box gets
  the parapet and the roof plant as one extra box each.

**Tests first.** The two spec modules as `house-spec` is tested: pure in `(id, level, variant)`,
a floor and a ceiling on triangles, every level reachable. **Gate.** `role_shots` and
`street_shots` on a played city, looked at; `budget_gate` re-measured; the chunk bake under 8 ms.

## S17 — Movers you can tell apart (M)

**Goal.** A boat is a boat, a train is a train, an aircraft is an aircraft.

**Do.** One pure `client/world/vehicle-spec.js` family, the way B3a built the car kit: a sailing
boat (hull, mast, a sail that S6's wind moves), a ferry (hull, superstructure, funnel, a wake —
exists), a cargo ship (hull, bridge, containers by hash), a locomotive and carriages (bogies,
windows, a livery per line), an aircraft (fuselage, swept wings, tail, engines), and a second
pass on the car so it is not two flat slabs from the pavement (a cabin with glass, wheel arches).
Each within a stated triangle ceiling, each with an L2 silhouette of a few boxes.

**Tests first.** `test/vehicle-spec.test.js`: every mover has a spec, a ceiling and an L2 form;
the lamps B4 poses still sit on a car's body. **Gate.** `harbour_shots`, `rail_shots`,
`airport_shots`, `service_shots` re-taken and looked at; the car rows in `budget_gate`.

## S18a — The parapet and the piers (S) — **BUILT 2026-10-06** as `slice-S18a`

`client/world/bridge.js`: a parapet along each kerb, standing on the deck and landing one point past
the water on each bank; piers every two tiles on the bed, and none at all in a one-tile stream.
`test/bridge-spec.test.js` holds each rule. Gate: `bridge_shots` green, the clearance numbers
unchanged, and the parapets read from the air.

**S20e, same day:** `smoke-S13-under.png` takes the photo camera now — two metres over the water,
forty off the deck line, looking at the crossing. The girder, the parapet and the deck's lamps read
from a boat. The pier is partly behind the bank's face from that angle; the frame is the check and
the clearance numbers beside it are the proof.

**S18b, same day:** the water's swell. Two thirds of that bullet were already built — one mesh (E8)
with corner-blended levels (S4) — and what was missing was the motion: `MOTION.ripple`, `rippleAt`
in node, the same constants in GLSL, flat at `uTime = 0` so `?life=0` and every frozen screenshot
keep S4's surface. The pale line where the water meets the shore is still open.

## S18 — The bridge, the wall and the water (M) — Q145 — **the camera and the wall done 2026-10-04**
## S18 — The bridge, the wall and the water (M) — Q145 — **BUILT bar the shore line, 2026-10-06**

`photo=<x>,<z>,<eye>,<yaw>,<pitch>` in the shot harness (F1's free camera, eye above the SURFACE —
over water that is the water); `tools/embankment_shots.mjs` finds the three deepest shoulders in
node, stands three metres off each and fails at zero baked chunks. 9.3 / 8.5 / 6.3 m, all at water,
7–8 chunks a frame, both arms from one harness (`wall=0`). Then the facing: `client/world/
retaining.js` decides, `streets-l3.js` draws stone with a concrete coping, no height moved. The
threshold is a storey — at 1.2 m a hilly 128 has 916 faced shoulders and 652 are under two metres;
at 3 m it has 130 and a rolling 96 has none. `walkthrough` prints the count.

**The other two bullets, closed 2026-10-06.** The deck is one profile and was already: every
corridor goes through `gradeProfile`, and over water `pavableAt` answers
`level + road.deckClearance`, so the deck is part of the same graded line as its approaches and
`heightAt` inside the corridor returns it (ruling 038, S13). The review round of 2026-10-06 wrote
the assertion that had been missing — `test/water.test.js`, "the deck is ONE profile" — and the
test says in the file what it discriminates: it fires when `heightAt` answers from the tile under
the point instead of from the profile, and it cannot fire on a stepped `pavableAt`, because
`gradeProfile` smooths that inside `road.maxGrade`. The water is one surface (E8) with
corner-blended levels (S4) and, since S18b, a swell. **Still open in this item: the pale line
where the water meets the shore.**

## S18 — The bridge, the wall and the water (M) — Q145 — the item as written

**Goal.** A crossing reads as a bridge and a lake as one sheet.

**Do.**
- **The deck is one profile**: a single graded line from abutment to abutment (R3's
  `gradeProfile` with the two bank heights as its ends), so the slabs do not step; a parapet or
  railing both sides, piers at the tile joints down to the bed, lamps at the ends.
- **The camera first, then the wall (A128, Kjell 2026-10-04).** The stone facing was built and
  reverted because nothing could photograph it: a street camera on a hilly shoulder stands inside
  the embankment and a city camera cannot bake street geometry. `tools/embankment_shots.mjs`
  takes the PHOTO camera (F1: an eye set directly) to a named tile, three metres out from the
  shoulder at eye height, prints the baked chunk count and fails at zero. Then:
- **The retaining wall** (Q145 → A128): where a street stands more than a storey
  above the shore, a wall face in stone tone from kerb to ground, with a coping. Renderer-only,
  no height changes, `walkthrough`'s shoulder-cliff count becomes a wall count.
- **The water is one surface**: shared vertices with a level blended across each tile's corners
  the way the terrain's are (the amendment S4 was given and did not need to take), a slow normal
  ripple as a uniform (S6; still under reduced motion), a pale line where it meets the shore.

**Gate.** `bridge_shots` and `water_shots` re-taken; `embankment_shots` after beside before;
`walkthrough` and `passability` unmoved.

## S19b — A station faces its TRACK, not its street (S) — found in S19, 2026-10-06

S19 mirrored `railStation` so its entrance faces the street, which `civicSpin` turns `+z` to — and
that puts the drawn platform on the far side, where the track may or may not be. Neither
orientation is right in general: a station's **platform belongs beside its line** and its entrance
beside its road, and the two are independent.

The engine does not care — `platformOn` projects the building's FOOTPRINT onto the corridor, so the
train stops in the right place whichever way the masses point — but the picture does: a station
whose line runs on the street side shows a canopy over grass and a platform with no track under it.

**Do.** Give `civicSpin` the option of a second axis for a definition that has one (the airport
already refuses to turn at all, `axis: true`), and turn a station by the nearest rail corridor
instead of by its frontage. **Gate.** `rail_shots`' station frame, with the line visible under the
canopy.

## S19 — The terminal, the station and the hall, by eye (S) — **BUILT 2026-10-06** as `slice-S19`

**Goal.** S1b's second pass for the transport lane's buildings: the airport terminal is a long
dark slab, and the station, the ferry terminal, the port and the city hall have had one pass
each. A glazed concourse and a tower for the airport; a canopy and a clock for the station; a
ramp and a waiting room for the ferry; cranes for the port; steps and a portico for the hall.
One shot per definition beside the previous one in the dev-log.

## S9 — Houses with more on them (M) — P61 — **done 2026-09-11 as `slice-S9`**

*Kjell, 2026-09-11: "houses need more details." The residential kit has six silhouettes and
fourteen roofs (V6) and the facade grammar (E5) glazes every face; what a house does not have is
the things that make one house that house. The reference Kjell attached in August — pitched
roofs, chimneys, faceted canopies, vivid grass — is the standard (memory: he judges by eye
against the reference; iterate with the render in front of you).*

**Do.** Per house, from the building's hash and its `level` (B2), all through the existing
facade grammar and roof kit — no new pipeline:
- **Roof furniture**: chimneys with pots on the ridge end (on all variants, by hash), dormers on
  level-2+ roofs, a skylight, gutters and a downpipe at one corner, a TV aerial or a dish, ridge
  tiles a shade darker.
- **Walls**: three materials by variant — clapboard (horizontal bands as vertex colour stripes),
  brick (a darker course every fourth band), render (plain) — and a plinth course at the base.
  Window shutters or window boxes on half the windows by hash; a bay window on level 3.
- **The front**: a porch with two posts and a step, a door with a fanlight and a house number
  plate, a garage door on wide lots, a path (exists), a gate in the hedge, a post box at the kerb
  (S3), a bin by the side wall.
- **The garden** (with S5): a shed, a washing line, a flower bed, a tree by variant; a fence type
  per street so a street reads as one street.
- **Distinct at city zoom too**: the L2 box gets the chimney and the porch as two extra boxes, so
  the silhouette from the air matches the facade from the pavement (the L2/L3 agreement, E5).

**Budget.** A house at L3 is 700–1,100 triangles today; this may add 300. Measure a chunk before
and after (V8: 33.7k) and record it; the L2 additions are counted in `budget_gate`'s rows.

**Tests first.** `test/facade-spec.test.js`: every added part is a pure function of `(id, level,
variant)`; a level-1 house has no dormer; the three materials are reachable. `test/kit.test.js`:
the L2 silhouette hash changes with the chimney and porch and there are still six distinct.
**Gate.** `reports/smoke-S9-{street,garden,city20}.png` — a residential street from the pavement,
one garden from the side, and the same street from `city 20t` on the big viewport (D8) — looked at
against the reference. The compare sheet (S8) row 3.

**In:** `client/world/house-spec.js` (pure: the parts, the materials, the courses, the porch
predicate both fidelities read) and `client/render/house-parts.js` (boxes and panels). A chimney
with a pot, dormers from level 2, a skylight, a downpipe, a plinth, clapboard and brick courses,
shutters and window boxes, a bay window at level 3, a porch with a post, a fanlight and a number
plate, a garage door on a wide lot. The L2 box gained a porch through `hasPorchAtL2`, which is the
one predicate both the instanced kit and the test can read.

**Four things this turned up, and one of them cost the slice its budget.**

- **The item's +300 a house was three times what the frame had spare.** Built to it, the furniture
  was 276–348 a house, **10,306 triangles a chunk**, and took `budget_gate`'s crowd frame from
  **289,446 to 369,858 against a 320,000 budget** — with the chunk bake at 9 ms against its own
  limit. The item's "700–1,100 triangles a house at L3" was also wrong for the common case: a
  one-tile house is **272 at level 1 and 508 at level 3**.
- **Drawing flat things flat paid for half of it.** A course of brick, a shutter, a fanlight, a
  number plate and a garage door have no thickness anybody can see, so they are quads rather than
  boxes — two triangles where twelve were. 126 a house with every part still on it.
- **And the rest came from putting the detail where it can be seen.** The furniture is baked into
  the **three nearest chunks** only (`FURNISHED` in `street-chunks.js`), salted into the chunk hash
  the way the territory overlay is, so a chunk rebakes when it crosses the line. The crowd frame is
  **301,980 of 320,000** and the bake p95 is back to 6 ms.
- **A chimney sized to a ridge computed without the eave is buried in the roof.** `roof-kit.js`
  builds the roof on a box EXPANDED by the overhang, so the ridge is higher than the wall span
  alone suggests. The first version came up 0.4 m short — invisible to a test that only asked
  whether anything was in the sky, obvious in the first screenshot. `ridgeRise()` is shared by the
  renderer and the test now, and the test asserts the chimney CLEARS the ridge.

**Also:** every part is behind a hash, and hashes multiply — the first cut left house 1 with a
chimney, a plinth and nothing else. A house that draws no SHAPE (porch, dormer or bay) gets a
porch, and `test/house-spec.test.js` has a floor as well as a ceiling.

## Order

**Where this lane stands, 2026-10-08.** S1–S14 and S16–S18 are built, with S18 closed bar one
bullet. What is open, cheapest first: **S19b** (a station faces its track), **S18's pale shore
line**, **S20's second half** (the shot gates count their subject's features in frame, not chunks),
**S15b** (the lit response — a material raised by 60 arrives raised by 25), **S15c** (road width and
the grey unbuilt lot), **S14** (the batter, tried and reverted — it wants the picture layer), and
**S22** (a sun that moves, analysed 2026-10-08, rate is Q160).

**After the review of 2026-10-04: re-run the shot sets and look → S18 (the slice in flight) → S15 → S16 → S17 → S19**, beside the multiplayer lane and W6.

**S9, S1, S10, S1b, S2, S6 and S5 are done (2026-09-11/13), with B4, B7 and B8 from the behaviour lane. After the review of 2026-09-13: R5 → S3 → B5 → B9 → S4 → B1 → S7 → B3 → S8**, interleaved with `workitems-behaviour.md` where it says
so (S9 and S1 with B2, S6 with B1). Houses first because Kjell asked for them by name (P61) and every
screenshot has them in it; ground second
because D4 said it is the largest difference; motion third because it is cheap and makes every
later screenshot alive.

## S12 — A bank, not a quay (S) — found in S4, 2026-09-17 — **BUILT 2026-10-03** as `slice-S12`

*Built: `water.bank` (3 tiles) cuts the shore in `landAt` — not in `heightAt`, because everything
else is derived from the land — and `pavableAt` reads the BARE land, so a street that reaches the
water is on an embankment rather than graded down into it. Ruling 038 is amended with it. The
criterion is measured rather than asserted: no fixed-width cut can flatten a hill that meets water,
so what the ladder chose is the knee (41/50/48% of shores over 15% at bank 0; 7/1/14% at 3; no
better at 5 or 8).*

**Goal.** Where the land is high, the shore rises out of the water instead of dropping into it.

**Why.** S4 capped the water at its bank and cut a channel under it, which ended the river painted
across a hillside (159 flooded tiles on seed 1003 → 0). What it did not do is widen the cut: the
bank is ONE tile, so where the land stands high it falls **7.44 m over 20 m** — 37%, which reads as
a quay wall in `reports/smoke-S4-shore.png` and is a cliff the walker cannot climb. A river in the
reference row has a shore you can walk down.

**Do.** The bank is R3's `gradeProfile` pointed at the water layer (A50's own description of a cut):
blend the land down toward the water's level over `water.bank` tiles rather than one, in
`client/world/ground.js` where the water clamp already is. Data, not a constant. The wet-sand band
and the reeds (S2) follow the new waterline for free.

**Tests first.** `test/water.test.js`: the slope from dry land to the waterline is under
`road.maxGrade` on a generated region, on the seeds S4 measures; the bed stays below both banks;
the surface is unchanged (the sheet is a separate thing from the ground under it).
**Gate.** `walkthrough` on a river map — no cliff at a shore — and `reports/smoke-S4-shore.png`
re-shot beside the S4 one, looked at.

