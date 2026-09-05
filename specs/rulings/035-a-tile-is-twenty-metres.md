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

## Enforced by

- `specs/engine/04-city-model.md` §4.1 — the frame
- `data/cityviewer.json` — the constant (after E0)
- `test/world.test.js` — a straight road of N tiles is one corridor of `N × TILE_M` (after E0)
