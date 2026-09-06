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

## 5.4 Networks

Wire and pipe keep ruling 030: hub plus arms from the mask, one width end to end, above the
road. With relief they sample `heightAt` at the tile centre and the arm ends, so a run climbs
a hill in straight segments instead of vanishing into it. Poles every third tile at L2; at L3
a pole is a thin box with a cross-arm and a sagging wire between poles (`sagCurve` in
Higashiyama's `util.js`) - eight triangles a span, and the single thing that most makes a
suburb read as a suburb from eye height.

## 5.5 Water

A separate low plane per chunk that has any water tile, at the water level, unlit-ish and
slightly transparent. The shoreline is where the land mesh dips under it; no bevel needed once
the corner heights blend (5.1.2). Rivers as corridors with `kind: 'water'` cut into the height
field (Higashiyama's `addCut`) are a later slice.

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
