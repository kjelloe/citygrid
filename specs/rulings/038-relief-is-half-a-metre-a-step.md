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
- `data/cityviewer.json` — `RELIEF_M` (after V4)
- `test/world.test.js` — a corridor is level across its width; a building's seat is the minimum of its corners (after E0/V4)
- `tools/play_shot.mjs` — the overlay-on-a-slope viewpoint in the capture list
