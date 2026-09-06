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
| verge | to the lot line | ground | grass / lawn |

At a junction the carriageway is the node box, the corner sidewalks are squares with kerbs on
their two exposed edges (Union Square `buildIntersection`), and a bezier connector gets a
curved ribbon. The walker's `floorAt` reads the sidewalk height, so a kerb is a step you walk
up, exactly as in Union Square (`Streets.SIDEWALK_Y`).

## 5.3 Markings

Two mechanisms, chosen by level:

- **L1-L2, instanced quads from the mask** - exactly what `roadMarkings` in `instances.js` does
  now (dash on a straight, arms at a corner, arms stopping `JUNCTION_GAP` short at a T or an X).
  Cheap, counted, and correct at city zoom.
- **L3, a marking canvas per chunk** - Union Square's `RoadMarkings` idea at chunk scale: lane
  lines, centre line, crosswalk bars and stop bars drawn once into a canvas covering the chunk
  and sampled in the road material by world x/z. No geometry, no z-fighting, follows any slope.
  A 512 px canvas over a 320 m chunk is 0.6 m/px, fine for a 3 m crosswalk bar and coarse for a
  10 cm lane line; 1024 px if the lines matter.

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
| **overlay wash and marks** | tile height | the **mean** of the tile's four corners. There is no right answer for a flat quad on a cliff, only a least wrong one: seating on the highest corner was tried and hovers visibly, the mean grazes. It cannot follow the zone tint into the mesh because it is toggled at runtime and that would rebuild every chunk on every switch (Q29) |
| build ghost and area preview | `elevation × 0.02` | `heightAt`, checked by `play_smoke` |
| shadow camera | `far: 400` | `far: 400 + 128`, the depth a u8 elevation spans at `reliefM` |

Picking marches the height field (`client/world/raymarch.js`) instead of intersecting `y = 0`.
The march skips to the band between `maxHeight` and `minHeight` before stepping, because the
orthographic camera sits 1,200 tiles out along its orbit and stepping from there would be over a
thousand height queries for one pointer move.
