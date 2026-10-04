# Ruling 035 — A tile is twenty metres

- **Date:** 2026-09-05
- **Source:** P37 — D2 "20 m", chosen from 16, 20, 24 and 32 in `specs/engine/12-decisions.md`
- **Status:** ruled

## Question

The engine and the renderer both work in tiles: a tile centre is `x + 0.5`, a house is 0.9 tiles
wide, a road is a tile. A street with kerbs, a car 4.5 m long and a door 2 m high need metres.
How many metres is a tile?

## Ruling

**`TILE_M = 20`**, one constant in `data/`, applied once at the boundary of `client/world/` and
never again. A road tile is a full right of way: an 8 m carriageway, 2.5 m sidewalks, verges to
the lot line. A 1×1 residential building is an 18 m lot with a house and a garden. A 128×128
region is 2.56 km across.

The engine never sees the number. Tiles stay tiles in `engine/`, in state, in the hash and in
every command; the camera's `span` stays in tiles so the LOD's pixels-per-tile keeps its
meaning.

## Why

Union Square's downtown right of way is 20.96 m for a 13 m carriageway; Higashiyama's streets
are 5–8 m in a 5.9 m townhouse module. Twenty metres puts a City Grid road between the two — a
residential street, not a boulevard — and makes the existing kit's 0.9-tile footprint an 18 m
house that reads correctly beside an 8 m road. Sixteen leaves no room for a kerb and a verge;
twenty-four makes downtown sparse; thirty-two turns a house into a block.

It is ruled rather than tuned because every later number is in metres: floor heights, bay
widths, lamp spacing, car length, the walker's radius, the street-level LOD threshold. A
change after E0 is a change to all of them.

## Consequences

- `client/world/` is in metres; `client/render/` draws in metres; the camera and the input layer
  convert at their own boundary.
- `FLOOR_H`, `BAY_W`, `ROAD_W`, `SIDEWALK_W`, `SETBACK` per zone are data, in metres, in
  `data/cityviewer.json`.
- Worldgen, map size advice (011) and the balance are untouched: a tile is still a tile to
  the simulation.

## Amended at A113 (2026-10-03) — the city camera agrees with the ruling

"A road tile is a full right of way: an 8 m carriageway, 2.5 m sidewalks, verges to the lot line"
has been true of the street-level bake since E3 and false of the city camera since N30: a road is a
colour of the terrain mesh, and the mesh painted the WHOLE tile asphalt. From the air a street was
therefore **two houses wide**, where the reference D4 compares against is two thirds of one — which
is what Q102 is, and no amount of `road.width` fixes it, because `road.width` does not reach the
mesh.

The terrain mesh splits a straight road tile into three bands — grass, carriageway, grass — at the
widths this ruling already states. Only a straight run: a junction, a corner and a stub are paved
corner to corner, which is what they are on the ground. `road.minVerge` (1 m) is the width below
which the strip is not worth four triangles, which is also what makes an avenue fill its tile:
14 m of carriageway and two 2.5 m pavements leave half a metre.

The hard edge between built and natural ground moved with it. `corner()` returned a tile's own
colour the moment a neighbour was built; what a verged road shows at its edge is GRASS, so the
neighbour blends with it and the hard edge is at the carriageway instead. Measured on a played 64:
**410 of 1,398 road tiles** keep a verge, for 1,640 triangles on an 18,432-triangle ground, and the
frame goes from 108,850 to 110,102.

## Enforced by

- `specs/engine/04-city-model.md` §4.1 — the frame
- `data/cityviewer.json` — the constant (after E0)
- `test/world.test.js` — a straight road of N tiles is one corridor of `N × TILE_M` (after E0)
