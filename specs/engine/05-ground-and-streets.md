# 05 - Ground and streets

## 5.1 Terrain mesh

Keep the chunked, dirty-rebuilt, vertex-coloured mesh in `client/render/terrain.js`. Three
changes, all from the V lane:

1. **Heights from `heightAt`** (04.2) instead of `elevation × 0.02`, so relief and corridor
   flattening are in the mesh by construction. The grid vertex sits `STREET_DIP` (Higashiyama:
   0.16 m) below paving where a corridor covers it, so a ribbon never pokes through the ground.
2. **Colour blending across natural tiles (V3).** A vertex on the boundary of two grass tiles
   takes their mean; a vertex touching a built, zoned or paved tile keeps the tile's flat colour.
   Higashiyama's `groundColorAt` adds two cheap signals worth keeping: a mottle from value noise,
   and "how close is the nearest street" to darken and desaturate open land away from the city.
3. **Roads stay painted into the mesh** (N30) at L0-L2. At L3 the painted road is still there
   underneath; the ribbon lifts 0.02 m above it, and the kerb hides the join.

Cost: unchanged at 512 triangles a chunk. A finer grid is the wrong lever; detail comes from
ribbons and props.

## 5.1a As built (V3, 2026-09-06)

`client/world/ground-colour.js` — pure, and the palette is handed in, because
`client/world/` never imports `client/render/`.

`createGroundColour(state, palette)` returns `tile(x, y)` and `corner(x, y, c)`.
A corner takes the mean of the four tiles meeting there **only when all four are
natural**; the moment one carries a road, a zone or a building it keeps its own
tile's colour, so the edge of the city stays crisp and the grid still reads. One
knob, `ground.blend`, and 0 reproduces the flat picture exactly.

The mottle is `jitter(index, 5)` at ±`ground.mottle` of lightness, natural tiles
only — mottling tarmac would make it speckled.

The distance-to-street tone is a **flood outward from the road layer**, not a
corridor query per tile. `model.nearestCorridor` is the obvious way and measured
16.6 ms of terrain rebuild against a 15 ms budget; it is also more precision
than the answer needs, since `urbanReach` is 40 m, a tile is 20, and the value
feeds a per-tile colour. Two rings, one pass over the map, 11.6 ms (Q28).

Measured on a saturated 128×128, median of five full rebuilds: 10.2 ms with the
slice off, 11.6 ms with all of it on. Triangles unchanged — this is vertex
colour, not geometry.

## 5.1b As built (S2, 2026-09-12) — ground that is somewhere

D4's sheet put City Grid's town beside a reference whose ground is bright lime grass and open
country, and ours was a colour chart: dark grass, and empty zoning painted as a beige slab the size
of the town (Q73).

- **The countryside** (`client/world/countryside.js`, pure): grass between `FIELD_REACH` (3) and
  `FIELD_RANGE` (12) tiles from anything built is fields, in blocks of `FIELD_BLOCK` (4) tiles — a
  meadow or a striped crop in one of three colours, hedgerows along six in ten of the edges between
  blocks, a farm track along one in twelve. A function of the tile, its distance to the town and
  the map seed; a map with nothing built on it has no farms. `countrysideFor(state, model)` caches
  one per model, because the instanced pass and the estimate both ask every frame.
- **Two grass tones** by a coarse bilinear noise (`ground.tone`, 0.55, in data), and a **wet band**
  on sand beside water.
- **An empty plot is ground** with a faint wash of its zone (22%), and the "this is zoned" is a
  kerb in the zone's full colour on every edge the plot does not share, plus a sign on a quarter.
- **Matter** at L2, on the props rung with the tufts and drawn inside baked chunks too (the baker
  places none of it): stones on rock and dirt, undergrowth in woods, reeds in marsh, hedgerows,
  kerbs, signs. `countScene` prices each at the rate it is placed, the plot kerbs and the hedges
  exactly.
- **The grass** moved 0x62c144 → 0x98f040 in two measured steps (art-direction §3.1).

**Measured**, the 64-tile played city: lit grass **#48a038 → #78b058–#88b850** against the
reference's #70d050–#98f068; beige-slab samples from 11,336 in a city shot to **0.0–0.2%** of the
compare sheet's; at a close city view 550 kerbs, 43 signs and 18 hedges drawn. **Two things it
could not show:** no fields, because this city fills its map; and no stones or reeds, because
worldgen makes no dirt or marsh and rock only above elevation 215 (Q98).

## 5.2 Ribbons (L3 only)

Union Square's `strip` and Higashiyama's `ribbon` are the same primitive: a quad strip along a
polyline, every vertex sampled from `heightAt`, a small lift. Per corridor at L3:

| Piece | Width | Height | Material |
|---|---|---|---|
| carriageway | `ROAD_W` | `heightAt + 0.02`, 0.035 m camber | asphalt (vertex colour or Canvas2D) |
| kerb face | - | vertical from road to `+0.15` | kerb |
| sidewalk | `SIDEWALK_W` each side | `+0.15` | concrete |
| verge | to the lot line | ground | **the ground's own colour** — `groundColour.natural()` for the tile under it (A38, V7), not a flat lawn |

At a junction the carriageway is the node box, the corner sidewalks are squares with kerbs on
their two exposed edges (Union Square `buildIntersection`), and a bezier connector gets a
curved ribbon. The walker's `floorAt` reads the sidewalk height, so a kerb is a step you walk
up, exactly as in Union Square (`Streets.SIDEWALK_Y`).

**Built (E3, 2026-09-06).** `client/render/ribbon.js` is the primitive and it is pure, so the
things that go wrong in it are testable in node: `ribbon` (mitred offsets, per-vertex draping,
a three-column crown when cambered), `skirt` (the kerb faces), `sagCurve`, `dashes` (a centre
line that keeps a bend's vertex), `clip` (a corridor's part in one chunk) and `trim` (how far
short of a junction the kerbside stops). `client/render/streets-l3.js` is the plumbing.

Three things the table does not say, all found by looking at the render:

- **Winding is not a property of the normal.** The first version flipped a face's normal when it
  came out pointing down and left the vertex order alone, so the road was lit correctly and then
  culled — and which streets survived depended on which way their corridor ran. Every face the
  addon emits now agrees with itself, and `test/ribbon.test.js` asserts it for a run in each
  direction.
- **The verge is load-bearing.** At city zoom a road TILE is asphalt for its whole 20 m
  (§5.1), which is right at eighteen pixels a tile and wrong at a hundred and eighty: it leaves
  the 8 m carriageway floating in twelve metres of grey with nothing for the kerb to be a kerb
  against. The baked chunk lays its own verge from the pavement edge out to the tile edge.
  It is painted in the colour of the land it is on, not `palette.lawn` (A38, V7): a road through
  sand or rock had two metres of green either side of it. `tile()` answers tarmac for a road tile
  — the verge is INSIDE it (ruling 035) — so the verge asks `natural()`, which is the same tile
  with nothing built on it. A corridor is emitted as one strip per run of spans the ground agrees
  about, which on most streets is one.
- **The kerbside stops at the junction, the carriageway does not.** Pavement, verge and centre
  line are built from the corridor `trim`med by `ROAD_W / 2 + SIDEWALK_W`; trimmed before the
  chunk clip, or a corridor crossing a chunk boundary loses its pavement at the seam instead.

The height field is sampled ONCE per centre-line point and shared across the cross-section:
`heightAt` is a search over nearby corridors, and asking it per column made a chunk bake take
9 ms against an 8 ms budget.

## 5.3 Markings

Two mechanisms, chosen by level:

- **L1-L2, instanced quads from the mask** - exactly what `roadMarkings` in `instances.js` does
  now (dash on a straight, arms at a corner, arms stopping `JUNCTION_GAP` short at a T or an X).
  Cheap, counted, and correct at city zoom.
**Built (E3): dashed ribbons, not a canvas.** The centre line is `dashes()` along the corridor —
3 m of paint every 12 m, 15 cm wide, a centimetre above the crown — so it follows a bend instead
of stepping round it, and it stops short of a junction with the rest of the kerbside. A canvas
was not needed to draw one line, and geometry the walker can be tested against was worth more
than a texture. **A33** settles it: crosswalks and stop bars are ribbons too.

- **L3, ribbons** (amended 2026-09-06, A33 — the canvas is dropped). The centre line is
  `dashes()` along the corridor; E5 adds crosswalk bars and stop bars as short ribbons across
  the carriageway at the lane graph's stop lines. One primitive, testable in node, and the
  walker can be tested against it. A canvas would have been a second sampling path and a
  texture per chunk for a few strips of paint.

**Amended (S3a; corrected in S3b): a crossing where a signal or a door demand is.** T1 kept zebra bars
at every junction (A51), and from the air a dense grid was white bars (the review after S5).
`crossingWanted(model, node)` in `signals.js`: a signalled junction, or one where the doors on an
arm draw people — a standing shop's or civic building's, each door on its nearest corridor
(`doorDemand`, derived once per model). S3a counted `occupancy × perOccupant`, and the engine's
`occupancy` is residents: every shop in a played city has none, so S3a painted no crossing at any
shop in a real game while its test, on a shop it gave forty occupants, passed. A house's
door is not counted: people leave a house for somewhere, and the somewhere is where they cross.

## 5.4 Networks

**Amended (S3a, A80): a pipe is underground.** It is not instanced at all; it shows while the water
overlay is on, as that overlay's texture (ruling 041), which marks every piped tile supplied or dry
— `client_smoke` checks the pools hold no pipe on a city with 1,361 piped tiles. The estimate no
longer charges for pipes. The wire stays at every zoom, **0.09 of a tile** (it was 0.16) and greyer
from the city camera; the baked street-level wire is unchanged.

Wire (and, until S3a, pipe) keeps ruling 030: hub plus arms from the mask, one width end to end,
above the road. With relief they sample `heightAt` at the tile centre and the arm ends, so a run climbs
a hill in straight segments instead of vanishing into it. Poles every third tile at L2; at L3
a pole is a thin box with a cross-arm and a sagging wire between poles (`sagCurve` in
Higashiyama's `util.js`) - eight triangles a span, and the single thing that most makes a
suburb read as a suburb from eye height.

## 5.4b Streets with detail (S3b, 2026-09-13)

Every street prop beyond the lamps and hedges is placed by a pure function in
`client/world/street-furniture.js`, and the solid ones become colliders from the same list (A43):

- **At a junction** (`junctionProps`): a bollard on each KERB corner between two arms at about a
  right angle, and one **street-name sign** at the back of the pavement — both clear of the line a
  person walks, which is where the first cut put the bollard and where `walkthrough` stopped dead.
  The name is from `data/names.json`'s `streets` (mirrored in `STREET_NAMES`, equal length in every
  locale), picked by the corridor's id; every board in a chunk reads ONE atlas texture
  (`nameAtlas`, a row per name), because a texture per name was a mesh per name — 81 meshes over
  nine chunks against `budget_gate`'s "one draw call per material".
- **Along a corridor** (`corridorProps`): a manhole in a lane every 40 m, a drain at the kerb every
  30 m, and on a street of three tiles or more a post box at the back of the pavement — nothing
  inside a junction box.
- **Outside a standing shop** (`shopProps`; not ruined — not `occupancy`, which the engine fills
  with residents and leaves at zero on every shop): a bench on one side of the door and a bike
  rack on the other, and a row of **parking bays** in the strip between the pavement and the shopfront,
  never across the door's path (`DOOR_CLEAR`). The instanced pass parks cars in them at every
  zoom, in the same pools as every car, and no longer drops a random one on the road in front of a
  shop; the estimate prices them as the props they replaced.
- **At a signalled junction** (`stopMarks` in `signals.js`): a stop line across each inbound lane
  just behind the zebra, and a lane arrow behind that — from the lane graph's own inbound links,
  whose last point is where a car stops.
- **Wear**: a darker band down each lane where the wheels run and a lighter patch or two per run —
  extra ribbons on the carriageway, no texture.

Colliders: bollards, sign posts, post boxes and benches; a drain, a manhole and a bike rack are
stepped over. **Not in S3b:** the widths (Q102 — the item's three knobs cannot change the air
view) and bridges (with S4).

## 5.5 Water

A separate low plane per chunk that has any water tile, at the water level, unlit-ish and
slightly transparent. The shoreline is where the land mesh dips under it; no bevel needed once
the corner heights blend (5.1.2). Rivers as corridors with `kind: 'water'` cut into the height
field (Higashiyama's `addCut`) are a later slice.

**Built (E8, 2026-09-07), with three deviations from the paragraph above, each measured.**

`client/world/water.js` is where the water IS — pure, node-loadable, and where the tests are;
`client/render/water.js` is the surface, and is plumbing.

1. **The level is per TILE, not per map.** `waterLevel` was one number, the maximum land height of
   any water tile anywhere; on the `rolling` fixture that is 47.5 m while the same river's lowest
   tile is at 14 m, so a river running down a valley was drawn as a plateau at the height of its
   highest tile for half its length. Every water tile carries its own surface — its own land
   height — which makes a lake level by construction (its tiles share an elevation) and lets a
   river step down its valley, which is what a river does at twenty metres a tile.
2. **Not a plane but a quad a tile**, and **not per chunk but one mesh.** A single plane is a
   single height, which is (1) again. Per chunk it was sixteen draw calls on a 64×64 and
   `client_smoke` went red at 89 against its budget of 80 — the check that exists to notice
   instancing quietly stopping. One mesh is one call and forfeits frustum culling, which costs
   nothing: 1,570 triangles for a whole 64×64, less than one building, against 512 for a single
   terrain chunk. The budget is therefore charged the whole map's water rather than the part on
   screen, because the whole map's water is drawn.
3. **Lit, not unlit.** Unlit is the obvious choice — water is a reflection, not a surface catching
   a lamp — and it produced a river glowing cyan through a black city at midnight. Not because the
   colour was wrong: dimming it by the preset's hemisphere is arithmetic three does in LINEAR
   space, so a factor of 0.34 is about 0.6 to the eye while the lit ground beside it had gone to
   almost nothing. A lit material dims by exactly what everything else dims by, without a second
   copy of the lighting rules; the hour still tints it toward the sky, which is what makes a
   sunset land on it.

**The bed drops.** A surface and a floor at the same height is not water, it is a blue field, so
`heightAt` over water answers the BED — the surface less `water.depth` — and the shoreline is
geometry: it is where the bed comes up through the surface. Depth is a flood outward from the
shore over `water.shelf` tiles, so a beach is a beach and not a step the height of the water. The
drawn surface sits `water.lift` (6 cm) above the level, because at the waterline the bed IS the
surface and a plane at exactly the level z-fights with the sand under it.

**The walker stays out** (Q58). `collision.floorAt` refuses a water tile deeper than `water.wade`,
so the edge is a paddle and open water is a wall. A causeway is exempt: `surfaceAt` returns the
road rather than the water where a corridor crosses it, and `heightAt` holds the carriageway at the
water's surface instead of on the riverbed — which is the causeway Q58 accepted.

## 5.6 Slope rules the world model must keep

- Nothing hard-codes a y. Every ribbon, kerb, prop and building samples `heightAt`.
- A flat layer at its own tile's height does not meet its neighbour on a slope (ruling 030's
  amendment). Anything flat either becomes a ribbon that samples the field, or floats far enough
  above it that the step is hidden. The overlay quads at `+0.075` are the case to test at
  `RELIEF_M` before anything ships.
- A crease in the height field is a line the ink pass draws (07). The corridor blend uses a
  smooth weight, not a clamp.

### The audit (V4, 2026-09-06)

Every layer that was flat, and what became of it. Measured on `terrainStyle: 'hilly'`, seed
1003 — 84 m of range and a 57 m drop inside one 7×7 window, which is far steeper than the
`rolling` default and is the case worth designing against.

| Layer | Was | Is |
|---|---|---|
| terrain mesh | `elevation × 0.02` per corner | `model.cornerHeightAt`, cached once per model; a corner touching a road drops by `road.dip` |
| road surface | a colour of the mesh (N30) | unchanged — it follows the field for free |
| **zone tint** | a 0.92 quad at `tile height + 0.012` | **stopped being a quad.** A colour of the mesh, like the road. It was the layer that failed visibly: seated on the tile's own height it sank into a hillside, and seated on the highest corner it hovered as a sheet over the grass |
| road markings | one lift baked into the geometry, one height per tile | each arm sampled at its own centre — a junction on a slope has four approaches at four heights |
| wire and pipe ribbons | one height per tile | hub and each arm sampled at their own centre |
| poles, ruins | tile centre | unchanged; they stand on one point |
| lamps, parked cars, tufts, trees | tile centre, drawn at an offset | sampled at the offset they are actually drawn at |
| buildings | tile height | `lot.seat` — the lowest corner of the lot (ruling 038) |
| lawn | tile height | the building's seat, so the uphill half is buried and reads as the plinth |
| **overlay wash and marks** | tile height | the **mean** of the tile's four corners (V4). There is no right answer for a flat quad on a cliff, only a least wrong one. **A31 / ruling 041 (V7): done.** The wash is a `DataTexture`, one byte a tile, sampled by world x/z in the terrain material and mixed over `outgoingLight` — it follows the ground because it is the ground's colour that frame, and toggling it uploads `width x height` bytes instead of rebuilding a chunk. Over the lit result rather than into the diffuse colour, or a slope in shadow merges two bands (measured: 25 apart against a floor of 30). The marks stay instanced at `heightAt`. A tile the overlay is silent about is left showing the city, so `PLANE_NONE` is a sentinel and not a fourth band. The BAKED street and facades are not washed: at street level the terrain between them and the marks on it are what carry the band |
| build ghost and area preview | `elevation × 0.02` | `heightAt`, checked by `play_smoke` |
| shadow camera | `far: 400` | `far: 400 + 128`, the depth a u8 elevation spans at `reliefM` |

Picking marches the height field (`client/world/raymarch.js`) instead of intersecting `y = 0`.
The march skips to the band between `maxHeight` and `minHeight` before stepping, because the
orthographic camera sits 1,200 tiles out along its orbit and stepping from there would be over a
thousand height queries for one pointer move.
