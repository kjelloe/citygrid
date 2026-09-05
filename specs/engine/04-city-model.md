# 04 - The city model

`client/world/` - pure functions over `state`, no three.js, node-tested. Coordinates are metres.

## 4.1 Frame

One constant, `TILE_M`, metres per tile, in `data/cityviewer.json` and mirrored in
`client/world/config.js` (the `engine/rules.js` pattern; `test/world.test.js` refuses drift). Everything City Grid draws today is in tile units
(`x + 0.5` is a tile centre, a house is 0.9 wide); the engine multiplies by `TILE_M` once at the
model boundary and never again. The camera's `span` stays in tiles so the LOD's pixels-per-tile
does not change meaning.

The choice of `TILE_M` decides what a tile *is* (D2):

| `TILE_M` | A 1×1 residential building is | A road tile carries | 128×128 map is |
|---|---|---|---|
| 16 m | a small house on a small lot | a 7 m carriageway + two 2 m sidewalks + verges | 2.0 km |
| 20 m | a house with a garden | 8 m + 2×2.5 m + verges | 2.6 km |
| 24 m | a house with front and back garden | 9 m + 2×3 m + verges | 3.1 km |
| 32 m | a townhouse block | a 12 m boulevard | 4.1 km |

Union Square's downtown right-of-way is 20.96 m for a 13 m carriageway; Higashiyama's streets
are 5-8 m in a 5.9 m machiya module. 20 m is settled (D2): a road tile is a full right of
way, a lot is a real lot, and the existing kit's 0.9-tile footprint becomes an 18 m house that
reads correctly beside an 8 m road.

Axes: `+x` east, `+z` south (tile `y`), `+y` up, as three.js and both worlds use. `DIR4` order
in `shared/grid.js` is N, E, S, W, and the low four bits of a network tile are the connection
mask in that order; the model reads that mask and nothing else about roads.

## 4.2 Ground - one height function

```
heightAt(x, z)            metres; the ground everything sits on
normalAt(x, z)            for things that lie flat
surfaceAt(x, z)           { kind: 'road' | 'sidewalk' | 'lot' | 'water' | 'ground', corridor?, dist }
```

Built in three layers, in the Higashiyama order:

1. **The land.** Bilinear over tile-corner heights, exactly as `terrain.js` does now, with the
   corner as the mean of its four tiles. Metres per elevation step is `RELIEF_M` (D7). At
   `RELIEF_M = 0.5` the u8 range spans 128 m, and a worldgen map with about eight levels of
   spread gives hills four metres tall - a slope you can see and a road can climb; at 0.02
   tile-units × 20 m it is what it is today, 0.4 m across the map.
2. **Corridor flattening.** Inside a road corridor's half-width the ground is the corridor's own
   centreline height, blended out over `CORRIDOR_BLEND` metres; junctions average. This is what
   stops a road tilting sideways across a slope and what lets a kerb be a constant 0.15 m. It is
   also what V4 warns about ("every remaining flat layer re-checked for the seam class of bug"):
   markings, zone tint, lawns and overlays all sample `heightAt` and follow.
3. **Water.** `TERRAIN_WATER` and `TERRAIN_SHALLOW` tiles clamp to a water level so a shore is
   a shore and not a hole.

Buildings are seated on the **lowest** corner of their lot and a plinth makes up the difference
(both worlds do this; a building seated on the mean floats at one corner). Picking stops
intersecting `y = 0` and marches the ray against the height field (V4).

## 4.3 Corridors

A corridor is a road run turned into a polyline with a width. From the road masks:

- Walk every road tile; a tile with exactly two opposite connections is *interior*; anything
  else (end, bend, T, X) is a *node*.
- A corridor is a maximal chain of interior tiles between two nodes, centreline through tile
  centres, `half = ROAD_W / 2`, `frontage = half + SIDEWALK_W`.
- A bend becomes a short bezier connector (Union Square `LaneGraph.bezier`), so a road that
  turns a corner is a curve on the ground and in the lane graph, not two ribbons overlapping.
- Kinds: `road` now; `rail`, `path`, `pipe`/`wire` later share the structure with their own
  widths and surfaces (ruling 030: draw a hub and arms from the mask, never a tile patch).

Corridors are what `surfaceAt` answers with, what plots are laid along, what the lane graph is
built on, and what the walkthrough gate steers by. One definition, four consumers.

## 4.4 Lots and frontages

A `buildings[]` record is `{x, y, w, h}` in tiles. The lot is that rectangle in metres, inset by
a `SETBACK` that depends on zone (a shop stands on the pavement, a house behind a garden - the
lawn pool already draws the garden). The **frontage** is the lot edge facing a road tile; ties
resolve by the building id hash, and a lot with no road neighbour faces the nearest corridor
(it also has no traffic, which the engine already models).

The frontage is what the facade grammar builds against (06) and what the nav graph attaches
doors to (09). `layoutPlots` from Higashiyama is not needed as such - the lots are given, not
generated - but its rule survives: *a wide frontage is followed by narrow ones*, applied when a
`w > 1` building is split into bays.

## 4.5 Building parameters

All from `(zone, level, valueTier, owner, id, frontage length)` and a hash, in one function so
every kit level agrees:

| Parameter | Today | Engine |
|---|---|---|
| variant | `variantFor(id, 4)` | same |
| height | `0.45 + level × 0.5` × jitter, unit scale | storeys = f(zone, level); metres = storeys × `FLOOR_H[zone]` |
| wall colour | zone × valueTier, varied by id | same, plus a material name at L3 |
| roof | house tile/slate vs flat felt (ruling 021) | same hue rule; roof *kind* (gable, hip, mansard, flat, sawtooth) per category and variant |
| bays | - | `round(frontage / BAY_W[zone])`, minimum one |
| storefronts | - | commercial ground floor: one bay per 4-6 m, sign text from a name table by id |
| lit windows | - | 35 % by hash, only at night presets |
| owner | tint at territory overlay | same, at every level |

## 4.6 Lane graph and nav graph

Both derived from corridors and lots, both in `client/world/`, both plain data:

- **Lanes**: `LANES[zone-of-road]` per direction, right-hand traffic, offsets from the
  centreline; block links from node to node with stop bars `EDGE_E` short of the box; connectors
  straight, shifted or turning through the node with Union Square's bezier. Signals at nodes with
  degree ≥ 3 on a hashed phase offset, so a city does not blink in unison.
- **Nav**: sidewalk edges along each corridor side at `half + SIDEWALK_W / 2`, crossings at
  nodes, a door node per lot frontage. Enough for commuters and shoppers; no plaza graph.

## 4.7 Life inputs

`state.tiles.traffic` is a hashed u8 commuter load per tile that only an overlay tint reads
today. Per link it becomes a target density (vehicles per 100 m) and a speed factor; that is
the whole coupling between the simulation and the cars, and it runs one way.

## 4.8 As built (E0, 2026-09-05)

`client/world/` holds `config.js`, `hash.js`, `params.js`, `corridors.js`, `ground.js`,
`lots.js` and `model.js`; `createModel(state)` returns corridors, nodes, connectors,
`heightAt`, `landAt`, `normalAt`, lots, `lotOf`, `lotAt`, `surfaceAt` and counts.
`scene.js` owns one and rebuilds it whole in `worldChanged()`; chunked rebuilds keyed by
content hash wait for E2. `instances.js` reads every building through `buildingParams`;
`detail-kit.js` and `building-kit.js` take `pseudo` and `variantFor` from the model. The
renderer does not yet consume `heightAt`, corridors or lots — V3, V4 and E3 do.
