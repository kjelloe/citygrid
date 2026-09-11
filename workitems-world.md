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

## S2 — Ground that is somewhere (M) — D4 findings 1 and 2, Q73

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

## S3 — Streets with detail (M) — D4 finding 4

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

## S4 — Water, banks and bridges (S) — Q65 (A50), A46

**Goal.** A river has banks and a bridge, a lake has a shore, and the walker can stand on both.

**Do.** R3's `gradeProfile` pointed at the water layer: a river corridor cut into the height
field with banks (Higashiyama's `addCut`), reeds at the edge (S2), a wet-sand band; bridge decks
where a road corridor crosses (S3). A lake keeps E8's shelf. `collision.floorAt` knows the deck.

**Tests first.** `test/water.test.js`: the bed under a river is below both banks; a bridge tile's
surface is the deck, not the water. **Gate.** `walkthrough` walks every bridge; `reports/smoke-S4-{river,bridge}.png`
from the bank and from the deck.

## S5 — Trees, gardens and parks (M)

**Goal.** Vegetation with variety, and a park that is a park.

**Do.** Species from three to six by terrain and zone (a street tree in a pit on commercial
streets, a conifer on rock, a willow at water, an orchard row in a garden); gardens per house
variant (a bed, a shed, a fence type); parks (S1) with a path, benches, a tree ring, a pond on a
big one. All faceted blobs, never billboards (ruling 032/Higashiyama). Instanced at L2, baked at
L3, and the crowd's `nav.js` gets park paths as walk edges so people go in.

**Tests first.** `test/foliage.test.js`: species is a function of terrain, zone and hash only;
`test/nav.test.js`: a park's path is reachable from the pavement. **Gate.** Budget re-measured;
`reports/smoke-S5-{park,garden,street-trees}.png`.

## S6 — Ambient motion (S) — spec §9.4

**Goal.** Restrained movement where the eye expects it. Nothing bounces, nothing pulses.

**Do.** Per-frame uniforms on instanced pools, no per-instance work: tree sway (a vertex offset
by height and a slow sine), wind-turbine blades (S1), a smoke column from industrial stacks and
from burning tiles (B1) — a chain of fading quads rising and drifting downwind, flags on civic
buildings, a crane that turns on a construction site (B2). Reduced motion stills all of it;
`?life=0` too, so screenshots stay byte-identical.

**Tests first.** `test/motion.test.js`: every animated pool has a still state at `t = 0` and
under reduced motion; the sway amplitude is bounded. **Gate.** two `screenshot.mjs` runs under
`?life=0` byte-identical (V1's gate, kept); `reports/smoke-S6-{wind,smoke}.png` at two times.

## S7 — Windows with something behind them (S)

**Goal.** A facade at eye height is not a grid of flat rectangles.

**Do.** Per window from the hash: a curtain or blind colour and depth as an inset quad, a lit
ratio at night that follows `building.occupancy` (B2), and for shopfronts a painted interior
backdrop behind the glass (Higashiyama's `shopfront.js`: a Canvas2D shelf-and-light card, no
photographs). The E5 facade grammar already has the module; this is what it draws.

**Tests first.** `test/facade-spec.test.js`: the window treatment is a function of the building
id and window index; the lit ratio is monotone in occupancy. **Gate.** chunk triangle count before
and after; `reports/smoke-S7-{day,night}.png` from the pavement outside a shop.

## S8 — The compare sheet, row by row (S)

**Goal.** The lane's own gate: D4's five findings each have a before and an after in one image.

**Do.** `tools/compare_sheet.mjs` gains a `--before <sha>` that shoots the same views from a
worktree at that commit, and a row per finding; `reports/compare-transport-worlds.png` is
re-baselined once per S item and the dev-log names which rows moved. Roof chroma (finding 3)
lands here as a palette amendment with §3.1 updated in the same slice.

**Done when** every row of the sheet has moved toward the reference by Kjell's eye, and the
budgets in ruling 040 carry the re-measured numbers.

## Q80 answered: `hilly` is playable (A57, 2026-09-10) — a slice for this lane

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

## S1b — Civic buildings you can tell apart (S) — A73

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

**S9, S1 and S10 are done (2026-09-11). Next: S1b → (B4 and B7 from the behaviour lane) → S2 → S6 → S5 → S3 → S4 → S7 → S8**, interleaved with `workitems-behaviour.md` where it says
so (S9 and S1 with B2, S6 with B1). Houses first because Kjell asked for them by name (P61) and every
screenshot has them in it; ground second
because D4 said it is the largest difference; motion third because it is cheap and makes every
later screenshot alive.
